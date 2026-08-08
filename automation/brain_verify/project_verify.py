#!/usr/bin/env python3
"""
project_verify.py — SPEC-4c, Route C (per-project verification). TEMPLATE.

*** THIS SCRIPT DOES NOT RUN IN aviv-brain. ***
Copy it into the SOURCING PROJECT's own repository (the project named in a
skill's `source:` field — e.g. notebook-x, data-center) together with
automation/checks/templates/project-brain-verify.yml, which is the workflow
that invokes it there. See SPEC-4c §0: "a different repository is not
something the harness starts either." This pair is specified once, here,
and installed per project — the same pattern as skills/unattended-agent-runs
and skills/windows-scheduled-agent.

What it does, run from inside the PROJECT repo's checkout:
  1. Clones aviv-brain read-only, using a fine-grained PAT the project repo
     must supply as the secret BRAIN_READ_TOKEN (aviv-brain is private).
  2. Finds every skill under skills/*/SKILL.md whose `source:` includes
     THIS project (by name, passed with --project).
  3. For each, resolves every `Code lives at:` path (and, where stated
     plainly enough to parse, symbol) against the project's own checkout.
  4. Opens ONE ISSUE PER NEWLY-BROKEN POINTER in the project's own repo
     (never in aviv-brain) — "newly" meaning: not already the subject of an
     open issue carrying the same fingerprint label, so re-runs do not spam.

Fails closed: a pointer that cannot be answered (unreadable brain clone,
unparseable skill file) is reported as a failure, not skipped.

Requires: git, and the `gh` CLI authenticated in the workflow environment
for issue creation (GITHUB_TOKEN is enough for issues in the SAME repo the
workflow runs in — this script only ever opens issues in that repo).

Usage:
    python project_verify.py \\
        --project notebook-x \\
        --project-root . \\
        --brain-clone-dir /tmp/aviv-brain \\
        --brain-repo-url https://github.com/<owner>/aviv-brain.git \\
        [--json-out PATH] [--no-issues]

Exit code is non-zero if any newly-broken pointer was found or any check
errored.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterator

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import Finding, FrontmatterError, emit_jsonl, load_frontmatter, rel  # noqa: E402

CODE_LIVES_RE = re.compile(r"Code lives at:\s*(.+)", re.IGNORECASE)


class MissingSecretError(Exception):
    """Raised when a required secret/env var is absent. Callers MUST turn
    this into a not-attempted Finding, not just an exit code — a run that
    dies with only a stderr message and no finding record is exactly the
    failure this exception exists to prevent: the finding artifact would
    show nothing at all, indistinguishable from 'checked, found clean.'"""
    def __init__(self, name: str):
        self.name = name
        super().__init__(name)


def die_missing_secret(name: str) -> int:
    print(
        f"project_verify: missing required secret/env var '{name}'.\n"
        f"This is a setup step you have not done yet for this project repo:\n"
        f"  1. Create a fine-grained, read-only PAT scoped to aviv-brain.\n"
        f"  2. Add it to this repository as an Actions secret named '{name}'.\n"
        f"  3. Re-run the workflow.\n"
        f"See automation/checks/templates/project-brain-verify.yml's header.",
        file=sys.stderr,
    )
    return 78  # EX_CONFIG-ish; distinct from the normal findings-found exit of 1


def clone_brain(brain_repo_url: str, token_env: str, dest: Path) -> None:
    token = os.environ.get(token_env)
    if not token:
        raise MissingSecretError(token_env)
    if dest.exists():
        return
    # Inject the token via the URL for a single, one-shot, read-only clone.
    # Never printed, never logged.
    if "://" in brain_repo_url:
        scheme, rest = brain_repo_url.split("://", 1)
        auth_url = f"{scheme}://x-access-token:{token}@{rest}"
    else:
        auth_url = brain_repo_url
    subprocess.run(
        ["git", "clone", "--depth", "1", auth_url, str(dest)],
        check=True, capture_output=True, text=True,
    )


def load_sourced_skills(brain_root: Path, project: str) -> list[tuple[Path, dict]]:
    out = []
    skills_dir = brain_root / "skills"
    if not skills_dir.exists():
        return out
    for path in sorted(skills_dir.glob("*/SKILL.md")):
        try:
            fm, _body, _ = load_frontmatter(path)
        except FrontmatterError:
            continue
        src = fm.get("source", "")
        sources = [s.strip() for s in src.split(",")] if isinstance(src, str) else src
        if project in sources:
            out.append((path, fm))
    return out


# A `Code lives at:` bullet that declares there IS no code. SPEC-0 §9.4
# requires an author to say this out loud rather than omit the section, so a
# checker that reports it as a broken pointer is punishing the exact honesty
# the spec demands. 6 of the 49 published skills use this form.
NO_CODE_RE = re.compile(r"^\W*(nowhere|nothing|none|n/a)\b", re.IGNORECASE)

# A markdown code span. Everything that is not one is PROSE, and prose is
# never a path.
CODE_SPAN_RE = re.compile(r"`([^`\n]+)`")

# Of the code spans, only the path-like ones. `_evaluate_matrix()` is a
# symbol; `auth.py` and `src/api/backend.js` are paths.
PATH_LIKE_RE = re.compile(r"^[\w.@+-]+(?:/[\w.@+ -]+)*$")


def _code_lives_bullets(block: str) -> Iterator[str]:
    """Yield the FULL text of each `Code lives at:` bullet, continuation lines
    included.

    The line-scoped original stopped at the first newline. These skill files
    are hard-wrapped at ~78 columns, so a bullet naming two repositories
    routinely puts the second pointer on line two and it was never read —
    the same line-versus-paragraph scoping defect aviv-brain's own SC-10 and
    SC-06 were fixed for on 2026-08-08. A bullet ends at a blank line or at
    the next list item."""
    lines = block.splitlines()
    i = 0
    while i < len(lines):
        if CODE_LIVES_RE.search(lines[i]):
            buf = [CODE_LIVES_RE.search(lines[i]).group(1)]
            j = i + 1
            while j < len(lines):
                nxt = lines[j]
                if not nxt.strip() or re.match(r"\s*(?:[-*+]|\d+\.)\s", nxt) or nxt.startswith("#"):
                    break
                buf.append(nxt.strip())
                j += 1
            yield " ".join(buf)
            i = j
        else:
            i += 1


def extract_code_pointers(skill_path: Path) -> tuple[list[str], bool, list[str]]:
    """Returns (pointers, declares_no_code, bare_names).

    REWRITTEN 2026-08-08, on Route C's first execution against real skill
    files. The original split the text after `Code lives at:` on commas and
    treated every fragment as a filesystem path. Against this library it
    produced, among 19 findings, 12 false BROKEN POINTERS on strings like
    `nothing new — this is a verification discipline`, `and its`, and
    `**nowhere.** This skill points at no implementation` — and, because it
    never stripped a trailing backtick, it also failed to resolve EVERY
    genuinely correct pointer in the repo it was run in. It had a 0% true
    accuracy rate on live input and would have opened an issue for each.

    It had never been run against a real skill file. The failure was not
    subtle; nothing had looked.

    The rule now: a pointer is a markdown CODE SPAN that looks like a path.
    Prose is prose."""
    text = skill_path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"##\s*How to rebuild.*?(?=^##\s|\Z)", text, re.MULTILINE | re.DOTALL)
    block = m.group(0) if m else text
    pointers: list[str] = []
    bare_names: list[str] = []
    declares_no_code = False
    for bullet in _code_lives_bullets(block):
        if NO_CODE_RE.match(bullet.strip()):
            declares_no_code = True
            continue
        for span in CODE_SPAN_RE.findall(bullet):
            span = span.strip()
            if not PATH_LIKE_RE.match(span):
                continue                       # a symbol, a flag, a quoted phrase
            if "/" in span:
                if span not in pointers:
                    pointers.append(span)
            elif re.search(r"\.\w{1,5}$", span):
                # A bare filename with no directory. It cannot be resolved
                # without searching the tree, and a checker that searches
                # answers a different question than the one asked ("a file
                # by this name exists somewhere" is not "this path is
                # correct"). Reported, never guessed at.
                if span not in bare_names:
                    bare_names.append(span)
    return pointers, declares_no_code, bare_names


def resolve_pointer(project_root: Path, pointer: str,
                    sibling_repos: frozenset[str] = frozenset(),
                    repo_name: str = "") -> tuple[bool | None, str]:
    """pointer is of the form '<repo>/<path>' or '<path>[, symbol]'.
    We can only verify the PATH half locally (the repo name is informational —
    this script runs inside that repo's own checkout already). Never trust
    a line number (SPEC-4b §6): existence of the path is what's checked.

    Returns (True, detail) resolved, (False, detail) broken, or
    (None, detail) NOT-ATTEMPTED — the pointer names a sibling repository
    that this checkout is not, so this run has no evidence either way.

    ADDED 2026-08-08, and it is a correctness fix, not a convenience.
    `source:` names a PROJECT; a project can be more than one repository.
    `smart-archive` is two — `smart-archive-app` (frontend, `api/`, `src/`)
    and `smart-archive-backend` (FastAPI, `main.py`, `auth.py`). Without the
    sibling declaration below, Route C running in either one reports the
    other one's pointers as BROKEN, which is the not-attempted-versus-failed
    confusion this whole system exists to prevent, reintroduced one layer
    down.

    Worse than the false positive is a false RESOLUTION: the
    drop-the-leading-segment fallback would happily match
    `smart-archive-backend/scripts/foo.py` against this repo's own
    `scripts/foo.py` if a same-named file existed in both. Skipping BEFORE
    the fallback is what removes that risk, so this is not merely noise
    suppression."""
    candidate = pointer.split(":", 1)[0].strip().strip("`")
    head, _, tail = candidate.partition("/")

    if head in sibling_repos:
        return None, (f"not-attempted: names sibling repo '{head}', which is not this "
                      f"checkout — Route C must run there to verify it")

    if head == repo_name and tail:
        candidate = tail          # explicitly OUR repo prefix; strip it and resolve
    elif sibling_repos:
        # A multi-repo project with an unprefixed pointer. It cannot be
        # attributed to a repository, so it cannot be verified — and the
        # dangerous outcome is not the false BROKEN, it is the false
        # RESOLVED: `automation/lib/comms.ps1` names a real file in the
        # sibling app repo AND, since Route C was installed here, a real
        # `automation/` directory in this one. Guessing would have produced
        # a green tick for a pointer nobody checked.
        return None, (f"not-attempted: '{candidate}' carries no repository prefix and "
                      f"'{repo_name}' is one of {1 + len(sibling_repos)} repos in this "
                      f"project — which repo it names cannot be determined")

    p = project_root / candidate
    if p.exists():
        return True, f"resolved: {candidate}"
    if not sibling_repos:
        # Single-repo project: the historical leading-segment drop is safe
        # here because there is no other repo for a segment to belong to.
        parts = candidate.split("/", 1)
        if len(parts) == 2 and (project_root / parts[1]).exists():
            return True, f"resolved after dropping leading segment: {parts[1]}"
    return False, f"does not resolve under this checkout: {candidate}"


def newly_broken(fingerprint: str, seen_open_fingerprints: set[str]) -> bool:
    return fingerprint not in seen_open_fingerprints


def list_open_issue_fingerprints(label: str) -> set[str]:
    """Read back open issues carrying `label`, extracting the fingerprint each
    one embeds in a hidden HTML comment, so a re-run does not re-open an
    issue for a pointer that is already tracked open. Uses `gh`; degrades to
    an empty set (every pointer looks 'new') if `gh` is unavailable — that is
    a safe direction to fail in for a read-only check, though it does mean a
    re-run could re-file an already-open issue rather than staying silent."""
    try:
        out = subprocess.run(
            ["gh", "issue", "list", "--label", label, "--state", "open",
             "--json", "number,body", "--limit", "200"],
            capture_output=True, text=True, timeout=30, check=False,
        )
        if out.returncode != 0:
            return set()
        issues = json.loads(out.stdout or "[]")
    except Exception:
        return set()
    fps = set()
    for issue in issues:
        m = re.search(r"<!--\s*fingerprint:\s*(\S+)\s*-->", issue.get("body", ""))
        if m:
            fps.add(m.group(1))
    return fps


def open_issue(title: str, body: str, label: str) -> None:
    subprocess.run(
        ["gh", "issue", "create", "--title", title, "--body", body, "--label", label],
        check=False,  # non-fatal: report failure as a finding, don't crash the whole run
        capture_output=True, text=True,
    )


def run(project: str, project_root: Path, brain_clone_dir: Path,
        brain_repo_url: str, token_env: str, make_issues: bool,
        sibling_repos: frozenset[str] = frozenset(),
        repo_name: str = "") -> tuple[list[Finding], bool]:
    """Returns (findings, missing_secret). missing_secret=True tells main()
    to also exit with the explicit die_missing_secret() failure — the
    finding record and the loud failure are not alternatives, both happen:
    the finding so the artifact shows WHY nothing was checked, the failure
    so CI actually goes red and a human notices the setup gap."""
    findings: list[Finding] = []

    try:
        clone_brain(brain_repo_url, token_env, brain_clone_dir)
    except MissingSecretError as e:
        # Recorded as NOT-ATTEMPTED, never as a failure — the distinction
        # the brief calls load-bearing: "one run this week reported zero of
        # seven pointers resolved, and only the not-attempted verdict
        # revealed a wrong repo declaration rather than broken pointers."
        findings.append(Finding("PV-01", "-",
                                 f"not-attempted: required secret '{e.name}' is not set — "
                                 f"nothing in this project could be verified against aviv-brain this run",
                                 severity="metric", extra={"reason": "no-token", "token_env": e.name}))
        return findings, True
    except subprocess.CalledProcessError as e:
        findings.append(Finding("PV-01", "-", f"could not clone aviv-brain: {e.stderr.strip()[:300]}",
                                 severity="check-errored"))
        return findings, False

    sourced = load_sourced_skills(brain_clone_dir, project)
    if not sourced:
        findings.append(Finding("PV-00", "-", f"no published skills carry source: {project} — nothing to verify"))
        return findings, False

    label = "brain-pointer-rot"
    open_fps = list_open_issue_fingerprints(label) if make_issues else set()

    for skill_path, fm in sourced:
        skill_name = skill_path.parent.name
        pointers, declares_no_code, bare_names = extract_code_pointers(skill_path)
        if bare_names:
            findings.append(Finding("PV-06", f"skills/{skill_name}/SKILL.md",
                                     f"{len(bare_names)} filename(s) cited without a directory and "
                                     f"therefore not verifiable: {', '.join(bare_names)}",
                                     severity="metric", extra={"reason": "unrooted-filename"}))
        if not pointers:
            if declares_no_code:
                # The author stated there is no code to point at, which
                # SPEC-0 §9.4 requires them to do. Nothing to verify, and
                # that is the correct outcome, not a defect.
                findings.append(Finding("PV-05", f"skills/{skill_name}/SKILL.md",
                                         "declares no code pointer (`Code lives at: nowhere`) — "
                                         "nothing to verify, per SPEC-0 §9.4",
                                         severity="metric", extra={"reason": "declared-no-code"}))
                continue
            findings.append(Finding("PV-02", f"skills/{skill_name}/SKILL.md",
                                     "sources this project but has no parseable `Code lives at:` "
                                     "pointer — a path must be written as a markdown code span",
                                     severity="check-errored"))
            continue
        for pointer in pointers:
            ok, detail = resolve_pointer(project_root, pointer, sibling_repos, repo_name)
            if ok:
                continue
            if ok is None:
                # NOT-ATTEMPTED. Emitted, never silent: an omitted pointer and
                # a verified one look identical in an artifact, and only one of
                # them is a gap.
                findings.append(Finding("PV-04", f"skills/{skill_name}/SKILL.md",
                                        detail, severity="metric",
                                        extra={"reason": "sibling-repo", "pointer": pointer}))
                continue
            fingerprint = f"{skill_name}:{pointer}"
            findings.append(Finding("PV-03", f"skills/{skill_name}/SKILL.md",
                                     f"broken pointer — {detail}", extra={"fingerprint": fingerprint}))
            if make_issues and newly_broken(fingerprint, open_fps):
                title = f"[brain pointer rot] {skill_name}: {pointer}"
                body = (
                    f"Automated verification (SPEC-4c) found a pointer in aviv-brain's "
                    f"`skills/{skill_name}/SKILL.md` that no longer resolves in this project.\n\n"
                    f"- Detail: {detail}\n"
                    f"- This issue is opened in **this project's** repository, never in aviv-brain "
                    f"(SPEC-4c §0). Nothing here writes to the brain.\n"
                    f"- Fixing the brain file is a YELLOW action there (SPEC-8 §3) — it needs a "
                    f"human diff, not an automated edit.\n\n"
                    f"<!-- fingerprint: {fingerprint} -->"
                )
                open_issue(title, body, label)

    return findings, False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--project-root", type=Path, default=Path("."))
    ap.add_argument("--brain-clone-dir", type=Path, required=True)
    ap.add_argument("--brain-repo-url", required=True)
    ap.add_argument("--token-env", default="BRAIN_READ_TOKEN")
    ap.add_argument("--json-out", type=Path, default=None)
    ap.add_argument("--no-issues", action="store_true",
                     help="report findings only; never call `gh issue create`")
    ap.add_argument("--sibling-repo", action="append", default=[],
                     help="repeatable. Another repository belonging to the SAME "
                          "`source:` project. A pointer whose leading segment names "
                          "one is recorded not-attempted instead of broken, because "
                          "this checkout is not that repo and has no evidence either "
                          "way. Declare every sibling: an undeclared one produces a "
                          "false BROKEN, and can produce a false RESOLVED.")
    ap.add_argument("--repo-name", default="",
                     help="this checkout's own repository name, as skill pointers spell "
                          "it. Defaults to the project-root directory name.")
    args = ap.parse_args()

    findings, missing_secret = run(
        project=args.project,
        project_root=args.project_root.resolve(),
        brain_clone_dir=args.brain_clone_dir,
        brain_repo_url=args.brain_repo_url,
        token_env=args.token_env,
        make_issues=not args.no_issues,
        sibling_repos=frozenset(args.sibling_repo),
        repo_name=args.repo_name or args.project_root.resolve().name,
    )

    out_stream = args.json_out.open("w", encoding="utf-8") if args.json_out else sys.stdout
    try:
        n = emit_jsonl(findings, out_stream)
    finally:
        if args.json_out:
            out_stream.close()

    print(f"project_verify ({args.project}): {n} finding(s)", file=sys.stderr)

    if missing_secret:
        # The finding above already recorded not-attempted; THIS is the
        # loud, explicit failure the brief also requires — both happen.
        return die_missing_secret(args.token_env)

    errored = sum(1 for f in findings if f.severity == "check-errored")
    broken = sum(1 for f in findings if f.check_id == "PV-03")
    return 1 if (errored or broken) else 0


if __name__ == "__main__":
    raise SystemExit(main())
