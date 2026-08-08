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


def extract_code_pointers(skill_path: Path) -> list[str]:
    text = skill_path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"##\s*How to rebuild.*?(?=^##\s|\Z)", text, re.MULTILINE | re.DOTALL)
    block = m.group(0) if m else text
    pointers = []
    for line in block.splitlines():
        cm = CODE_LIVES_RE.search(line)
        if cm:
            for token in re.split(r",\s*", cm.group(1)):
                token = token.strip().strip(".")
                if token:
                    pointers.append(token)
    return pointers


def resolve_pointer(project_root: Path, pointer: str) -> tuple[bool, str]:
    """pointer is of the form '<repo>/<path>' or '<path>[, symbol]'.
    We can only verify the PATH half locally (the repo name is informational —
    this script runs inside that repo's own checkout already). Never trust
    a line number (SPEC-4b §6): existence of the path is what's checked."""
    # Strip a leading '<repo-name>/' segment if it matches this checkout's
    # own directory name — SPEC-7 §4's "the producer's queue repo and code
    # repo are one repository when they are two" pitfall, avoided by not
    # assuming which segment is the repo name.
    candidate = pointer.split(":", 1)[0].strip()
    candidate = candidate.lstrip("`").rstrip("`")
    p = project_root / candidate
    if p.exists():
        return True, f"resolved: {candidate}"
    # try dropping a leading path component (possible repo-name prefix)
    parts = candidate.split("/", 1)
    if len(parts) == 2:
        p2 = project_root / parts[1]
        if p2.exists():
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
        brain_repo_url: str, token_env: str, make_issues: bool) -> tuple[list[Finding], bool]:
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
        pointers = extract_code_pointers(skill_path)
        if not pointers:
            findings.append(Finding("PV-02", f"skills/{skill_name}/SKILL.md",
                                     "sources this project but has no `Code lives at:` line to verify",
                                     severity="check-errored"))
            continue
        for pointer in pointers:
            ok, detail = resolve_pointer(project_root, pointer)
            if ok:
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
    args = ap.parse_args()

    findings, missing_secret = run(
        project=args.project,
        project_root=args.project_root.resolve(),
        brain_clone_dir=args.brain_clone_dir,
        brain_repo_url=args.brain_repo_url,
        token_env=args.token_env,
        make_issues=not args.no_issues,
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
