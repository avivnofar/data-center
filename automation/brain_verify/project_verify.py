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

Exit code, split by severity 2026-08-09 (see main()):
    0  clean
    1  findings — a real defect in the library's files
    2  check-errored — the harness could not answer; a fault in the CHECK
    3  both
    78 required secret missing (setup gap, not a verdict)
A `metric` never moves the exit code. The stderr summary line carries the
full tally — attempts as well as failures — so a caller never has to open
the artifact to tell a clean run from a run that did not happen.
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

# ADDED 2026-08-10 (RUN J). This file is a TEMPLATE — it does not run in
# aviv-brain, it is COPIED into each sourcing project's own repo (see the
# module docstring). A6 and A5 above were fixed here on 2026-08-09 and the
# copies in all three deployed repos were never updated to match: they kept
# reporting the exact defects those fixes removed, for two days, because
# nothing said the deployed file and this one had drifted apart. "One script
# now exists in four places [this file plus three deployed copies]; nothing
# syncs them, nothing detects drift" — the library's own
# `skills/a-centralisation-needs-a-test-that-it-is-still-central` violated by
# its own automation.
#
# Bump this string whenever this file changes in a way that would change a
# run's findings. A DEPLOYED copy is this exact file, so it carries the same
# string automatically — no separate stamping step to forget. Detection only:
# this run already clones aviv-brain fresh (`brain_clone_dir`) to read the
# skills it verifies, so it can read THAT copy's TEMPLATE_VERSION too and
# compare, at zero extra cost. No sync mechanism — a stale deployed copy still
# has to be re-copied by hand — but it now announces itself in the artifact on
# every run instead of being inferred from a finding that would not clear.
TEMPLATE_VERSION = "2026-08-10.j2"
TEMPLATE_VERSION_RE = re.compile(r'^TEMPLATE_VERSION\s*=\s*"([^"]+)"', re.MULTILINE)
TEMPLATE_PATH_IN_BRAIN = Path("automation") / "checks" / "project_verify.py"

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
# the spec demands.
#
# NARROWED 2026-08-09 to `nowhere` ALONE. It previously also accepted
# `nothing`, `none` and `n/a`, and that breadth was not generosity — it was a
# silent data-loss bug. Three skills open the bullet with the English word
# "nothing" and then go on to name REAL paths ("nothing — these are
# documents, and the documents are the mechanism: `smart-archive/...`"). The
# old regex matched the first word, set declares_no_code and `continue`d past
# the whole bullet, so every pointer in it was discarded unchecked and the
# skill was booked as declaring no code. `nowhere` is now the SOLE canonical
# token; see PIPELINE.md rule 13. 17 records already use it, which is what
# makes it the form to standardise on rather than invent.
NO_CODE_RE = re.compile(r"^\W*nowhere\b", re.IGNORECASE)

# A markdown code span. Everything that is not one is PROSE, and prose is
# never a path.
CODE_SPAN_RE = re.compile(r"`([^`\n]+)`")

# A double-quoted span inside a bullet. ADDED 2026-08-09: quoted text is
# QUOTATION — a commit message, an error string, a line lifted from a file —
# and nothing inside it is a pointer this repository owns. Straight and curly
# double quotes only; a single quote is an apostrophe far more often than a
# delimiter ("Gemini's", "Code's") and pairing on it mis-spans prose.
QUOTED_SPAN_RE = re.compile(r"[\"“”][^\"“”\n]*[\"“”]")

# A git ref is not a path. ADDED 2026-08-09: `origin/main` was reported as a
# BROKEN POINTER in classify-merge-conflicts-by-file-class. It is a remote
# ref named in a sentence explaining a merge; the real pointer on that bullet
# is the commit hash. It is slash-shaped, which is the only reason it ever
# looked like a path.
GIT_REF_RE = re.compile(r"^(?:origin|upstream|remotes|refs|HEAD)(?:/|$)", re.IGNORECASE)

# Of the code spans, only the path-like ones. `_evaluate_matrix()` is a
# symbol; `auth.py` and `src/api/backend.js` are paths.
PATH_LIKE_RE = re.compile(r"^[\w.@+-]+(?:/[\w.@+ -]+)*$")

# --- THE EVIDENCE-PATH EXEMPTION, MACHINE-READABLE (added 2026-08-09) -------
#
# THE DEFECT. `PIPELINE.md` rule 6 exempts "a path quoted as EVIDENCE OF A
# DEFECT" and requires it to be "marked as such inline". That marking is PROSE
# — a sentence a human reads. This extractor's rule is "a pointer is a markdown
# CODE SPAN that looks like a path", and a quoted evidence path is a code span
# that looks like a path. The two rules are in direct conflict: an author who
# follows rule 6 correctly injects a false pointer into this checker.
#
# It is not hypothetical. On 2026-08-09 the correction notes written for three
# skills quoted their OLD, broken paths in code spans — the natural way to
# write "this used to say X" — and produced three false findings: a PV-03 that
# would not clear, and two new PV-06s (`INDEX.md`, `PIPELINE.md`) that were
# artifacts of the correction rather than defects in the library. See
# `triage/RECS-S3-2026-08-09.md` §F3. The workaround then was to strip the
# backticks and write the old path as bare prose.
#
# WHY THAT WORKAROUND IS NOT THE FIX. It makes correct authorship require
# REMOVING formatting, and removed formatting is invisible in the rendered
# page. The next author writing the next correction note types the backticks
# back — they are the obvious way to write a path — and the false finding
# returns with nothing to point at as the mistake. A convention whose correct
# form is an absence cannot be taught and cannot be checked.
#
# THE MECHANISM CHOSEN: an inline `evidence:` prefix INSIDE the code span.
#
#     `evidence:automation/lib/comms.ps1`   <- quoted. Skipped, and COUNTED.
#     `smart-archive/automation/lib/comms.ps1`  <- offered. Still resolved.
#
# Why this one, over the three alternatives that were on the table:
#
#   * Over an HTML comment (`<!-- evidence -->`) or any other invisible
#     marker: rule 6 requires a marking a HUMAN can see. An invisible machine
#     marker would make the human marking and the machine marking two separate
#     facts, and two facts about the same path drift — someone edits the prose
#     and the comment stays, or the reverse. `evidence:` is ONE marking that
#     both readers use, so it cannot be half-updated.
#
#   * Over a paragraph-scoped or note-scoped exemption ("everything in this
#     correction note is evidence"): a correction note routinely carries BOTH
#     the old broken path AND the new correct one — that is what a correction
#     note IS. A paragraph-scoped exemption would suppress the live pointer
#     along with the quoted one. Same "one signal masks another" defect
#     `structural_checks.py`'s SC-10 was fixed for on 2026-08-08, and the same
#     reason its blanking is span-scoped rather than line-scoped.
#
#   * Over widening the prose heuristic (the SC-06 approach, EVIDENCE_MARK_RE):
#     that regex has already been widened once, after failing on two texts that
#     HAD been marked. Guessing intent from surrounding English is a permanent
#     maintenance surface with no stopping condition. A declared marker has a
#     stopping condition: it is there or it is not.
#
# IT FAILS CLOSED, AND IT IS NEVER SILENT. An UNMARKED path is a live pointer,
# always — the marker is an explicit act by an author, never a default. And a
# marked path is not merely dropped: it is counted and reported as PV-08
# (metric). A mechanism that let an author silence a pointer with no trace
# would be a switch for turning this check off, which is the thing the
# exemption must not become. `N path(s) marked as evidence and skipped` is a
# line in the artifact, so the exemption's use is auditable.
#
# The `:` is doing structural work: PATH_LIKE_RE forbids `:`, so a marked span
# can never be mistaken for a path even if this branch were deleted — the
# failure mode of removing this code is a SILENT DROP, not a false pointer.
# That is why the counting branch exists rather than relying on that accident.
#
# Documented on the other side in `PIPELINE.md` rule 6.
EVIDENCE_PREFIX_RE = re.compile(r"^evidence:\s*(\S.*)$", re.IGNORECASE)

# A bare EXTENSION, not a filename. ADDED 2026-08-09: the unrooted-filename
# branch extracted `.js` and `.yml` out of
# manual-action-blind-spot-in-automated-security-audits and reported them as
# two filenames cited without a directory. They are not filenames at all —
# they are the file *types* the prose was talking about. A dot followed by
# nothing but 1–5 word characters and then end-of-token is an extension;
# `.gitignore` (9 characters after the dot) is a real filename and still
# passes.
BARE_EXTENSION_RE = re.compile(r"^\.\w{1,5}$")


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


def extract_code_pointers(skill_path: Path) -> tuple[list[str], bool, list[str], list[str], list[str]]:
    """Returns (pointers, declares_no_code, bare_names, malformed, evidence).

    `evidence` is the paths marked `` `evidence:<path>` `` — quoted as evidence
    of a defect, never offered as pointers, and never resolved. They are
    RETURNED rather than discarded so the caller can report how many were
    skipped; see EVIDENCE_PREFIX_RE above for why silence would be wrong.

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
    malformed: list[str] = []
    evidence: list[str] = []
    declares_no_code = False
    for bullet in _code_lives_bullets(block):
        if NO_CODE_RE.match(bullet.strip()):
            declares_no_code = True
            continue
        # Quotation is not pointing. Blank the quoted spans BEFORE extracting,
        # so a path-shaped token inside a commit message or an error string
        # never becomes a candidate (2026-08-09).
        scannable = QUOTED_SPAN_RE.sub(" ", bullet)
        for span in CODE_SPAN_RE.findall(scannable):
            span = span.strip()
            ev = EVIDENCE_PREFIX_RE.match(span)
            if ev:
                # Rule 6's evidence-path exemption, declared. Skipped as a
                # pointer, kept as a count — see EVIDENCE_PREFIX_RE. Recorded
                # even when the remainder is not path-shaped: what the author
                # DECLARED is the fact worth reporting, and a marked non-path
                # is an authoring mistake a silent drop would hide.
                marked = ev.group(1).strip()
                if marked not in evidence:
                    evidence.append(marked)
                continue
            if not PATH_LIKE_RE.match(span):
                continue                       # a symbol, a flag, a quoted phrase
            if GIT_REF_RE.match(span):
                continue                       # a git ref, not a path
            if BARE_EXTENSION_RE.match(span):
                continue                       # `.js` is a file type, not a file
            if "/" in span and re.search(r"\s", span):
                # MALFORMED, NOT BROKEN. Added 2026-08-09.
                # `data-center/automation/ instructions_auditor.txt` is one
                # code span opened before a hard wrap and closed after it;
                # markdown renders the wrap as a space and the space lands
                # inside the path. The target is almost certainly fine — what
                # is wrong is the WRITING of the pointer — so reporting it as
                # a broken pointer accuses the wrong artifact and would open
                # an issue in a project repo about a file that exists.
                # SPEC-1 §6.3: malformed and unresolved are different verdicts.
                if span not in malformed:
                    malformed.append(span)
                continue
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
    return pointers, declares_no_code, bare_names, malformed, evidence


DEFAULT_PROJECT_CONFIG = Path("automation") / "checks" / "project-sources.json"


class UnknownProjectError(Exception):
    """The sibling declaration could not be read for this project.

    RAISED, NEVER DEFAULTED. Every branch below could return an empty set and
    keep going, and an empty set is not a neutral value here: `sibling_repos`
    is the only thing standing between a pointer into another repository and a
    BROKEN record with an issue opened under it. RECS-S5 §S5-8 measured the
    difference on unchanged files — 0 broken became 16, 5 findings became 21 —
    so "we could not read the declaration" and "this project has no siblings"
    must never produce the same run.
    """


def load_project_repos(config_path: Path, project: str) -> frozenset[str]:
    """Every repository `project` spans, from the tracked config.

    Raises UnknownProjectError, with the reason and the legal keys IN THE
    MESSAGE, if the file is missing, unparseable, does not list this project,
    or lists it without a `repos` array. A caller that wants to run without a
    declaration has to say so with `--sibling-repo`, out loud, on the command
    line, where the next reader can see it.
    """
    if not config_path.exists():
        raise UnknownProjectError(
            f"project config not found at '{config_path}' — Route C reads the "
            f"sibling declaration from the brain's tracked "
            f"{DEFAULT_PROJECT_CONFIG.as_posix()}; pass --project-config to point "
            f"elsewhere, or --sibling-repo to declare siblings by hand")
    try:
        data = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise UnknownProjectError(f"project config '{config_path}' is unreadable: {e}")

    known = sorted(k for k, v in data.items() if isinstance(v, dict))
    entry = data.get(project)
    if not isinstance(entry, dict):
        raise UnknownProjectError(
            f"project '{project}' is not declared in '{config_path}'. Declared "
            f"projects: {', '.join(known) or '(none)'}. A project this checker has "
            f"never heard of cannot be given an empty sibling set, because an empty "
            f"sibling set is an ASSERTION that the project is one repository")
    repos = entry.get("repos")
    if not isinstance(repos, list) or not all(isinstance(r, str) and r for r in repos):
        raise UnknownProjectError(
            f"project '{project}' in '{config_path}' declares no `repos` array — a "
            f"single-repo project must say so with a one-element array. An absent "
            f"key cannot distinguish 'one repository' from 'nobody has looked'")
    return frozenset(repos)


def siblings_of(all_repos: frozenset[str], repo_name: str, project: str) -> frozenset[str]:
    """`all_repos` minus THIS CHECKOUT — case-insensitively, and by repo name
    only whenever a repo name is known.

    THE CASE FOLD IS NOT TIDINESS. This estate's checkouts and its pointer
    spellings already disagree: the directory is `Notebook-X` and every pointer
    writes `notebook-x`. A case-sensitive subtraction would leave this repo in
    its own sibling list, and `resolve_pointer()` tests the sibling set BEFORE
    it tests the own-repo prefix — so every one of this project's own resolved
    pointers would flip to not-attempted and the run would go green by checking
    nothing.

    THE PROJECT NAME IS SUBTRACTED ONLY AS A FALLBACK, and this was measured
    rather than reasoned. Subtracting it unconditionally looked right — it
    mirrors `resolve_pointer()`'s own `own_names` — and it silently broke the
    one row it could break: `smart-archive` is BOTH the project name and one of
    the project's three repository names, so running inside
    `smart-archive-backend` dropped the app repo out of its own sibling set and
    reported **15 broken pointers and 20 findings** against the audited 0 and 5.
    A project name is only this checkout's identity when nothing better is
    known; when `--repo-name` is given, it is the better thing.
    """
    mine = {repo_name.lower()} if repo_name else {project.lower()}
    return frozenset(r for r in all_repos if r.lower() not in mine)


BRAIN_REPO_NAME = "aviv-brain"


def resolve_pointer(project_root: Path, pointer: str,
                    sibling_repos: frozenset[str] = frozenset(),
                    repo_name: str = "", project: str = "",
                    brain_clone_dir: Path | None = None) -> tuple[bool | None, str]:
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

    if head.lower() == BRAIN_REPO_NAME and tail:
        # ADDED 2026-08-10 (RUN J, J2). A pointer prefixed `aviv-brain/` names
        # the brain itself — usually a citation of a rule or file in the same
        # repo the skill lives in (e.g. `aviv-brain/PIPELINE.md rule 15`), not
        # a sibling project repo and not an unknown project. This run has
        # ALREADY cloned aviv-brain to `brain_clone_dir` to read the skill
        # files being verified, so the target is on disk at zero extra cost —
        # resolving here is strictly more correct than not-attempted, which
        # would throw away evidence this run already has. Same asymmetry as
        # the sibling-repo case: an unknown prefix is not-attempted, but a
        # KNOWN prefix this run can actually check must be checked, not waved
        # through.
        if brain_clone_dir is not None and brain_clone_dir.exists():
            if (brain_clone_dir / tail).exists():
                return True, f"resolved against the brain clone: {tail}"
            return False, f"does not resolve under the brain clone: {tail}"
        return None, (f"not-attempted: names the brain ('{BRAIN_REPO_NAME}') but its clone "
                      f"at '{brain_clone_dir}' is not readable this run — no evidence either way")

    if head in sibling_repos:
        return None, (f"not-attempted: names sibling repo '{head}', which is not this "
                      f"checkout — Route C must run there to verify it")

    # An exact hit is unambiguous evidence and outranks every heuristic below.
    if (project_root / candidate).exists():
        return True, f"resolved: {candidate}"

    own_names = {n.lower() for n in (repo_name, project) if n}
    if tail and head.lower() in own_names:
        # Explicitly OUR repo prefix. We can be definitive in both directions:
        # strip it, and if the remainder is absent the pointer really is broken.
        if (project_root / tail).exists():
            return True, f"resolved after dropping this repo's own prefix: {tail}"
        return False, f"does not resolve under this checkout: {tail}"

    if sibling_repos:
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

    # AN UNKNOWN LEADING SEGMENT IS NOT-ATTEMPTED, NEVER BROKEN.
    # ADDED 2026-08-09 by architect ruling, and it is the same correctness fix
    # as the sibling rule above, generalised. Measured on one morning, the SAME
    # pointer `smart-archive/automation/run_night.bat`:
    #     smart-archive-backend -> not-attempted   (it had --sibling-repo)
    #     data-center           -> BROKEN POINTER  (it did not)
    # Nothing about the pointer differed. What differed was whether the run had
    # been told that another repo exists — and a checker must not convert its
    # own ignorance into a defect in someone else's file. Four of data-center's
    # six PV-03 records were false positives from exactly this.
    # smart-archive-backend's behaviour is the reference implementation.
    #
    # The test is evidence-shaped, not name-shaped: if the leading segment is
    # not a directory in this checkout, this run cannot tell a foreign repo
    # prefix from a removed directory, and NOT-ATTEMPTED is the only verdict
    # the evidence supports.
    #
    # This also replaces the old blind drop-the-leading-segment fallback,
    # which resolved `<anything>/scripts/foo.py` against this repo's own
    # `scripts/foo.py`. A segment is now dropped only when it has been
    # IDENTIFIED as ours (above) — a false RESOLVED is worse than a false
    # BROKEN, because nothing downstream ever looks at a green tick again.
    if tail and not (project_root / head).exists():
        return None, (f"not-attempted: leading segment '{head}' is not a directory in this "
                      f"checkout and is not this repository's name — it may name another "
                      f"repo in this project or a directory that was removed, and this run "
                      f"has no evidence either way")

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
        repo_name: str = "") -> tuple[list[Finding], bool, dict]:
    """Returns (findings, missing_secret, tally). missing_secret=True tells
    main() to also exit with the explicit die_missing_secret() failure — the
    finding record and the loud failure are not alternatives, both happen:
    the finding so the artifact shows WHY nothing was checked, the failure
    so CI actually goes red and a human notices the setup gap.

    THE TALLY IS THE DENOMINATOR, ADDED 2026-08-09.
    Until this run, every count below was computed and then thrown away: the
    artifact kept only the failures and the workflow printed `N finding(s)`.
    A count of failures with no count of attempts is indistinguishable from a
    harness that never ran — `0 finding(s)` is what a clean library and a
    silently broken checker both print. The manual run of 2026-08-08 produced
    `0 broken, 30 resolved, 15 not-attempted, 17 declared-no-code, 5 unrooted,
    3 check-errored`; only the first number survived into the artifact, and it
    is the only one of the six that means nothing on its own.
    """
    findings: list[Finding] = []
    tally = {
        "skills_sourced": 0,
        "pointers_examined": 0,
        "resolved": 0,
        "broken": 0,
        "not_attempted": 0,
        "skills_declaring_no_code": 0,
        "skills_with_unrooted_filenames": 0,
        "unrooted_filenames": 0,
        "evidence_paths_skipped": 0,
        "check_errored": 0,
    }

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
        return findings + [_tally_finding(project, tally)], True, tally
    except subprocess.CalledProcessError as e:
        findings.append(Finding("PV-01", "-", f"could not clone aviv-brain: {e.stderr.strip()[:300]}",
                                 severity="check-errored"))
        tally["check_errored"] += 1
        return findings + [_tally_finding(project, tally)], False, tally

    findings.append(_version_finding(brain_clone_dir))

    sourced = load_sourced_skills(brain_clone_dir, project)
    tally["skills_sourced"] = len(sourced)
    if not sourced:
        findings.append(Finding("PV-00", "-", f"no published skills carry source: {project} — nothing to verify",
                                 severity="metric"))
        return findings + [_tally_finding(project, tally)], False, tally

    label = "brain-pointer-rot"
    open_fps = list_open_issue_fingerprints(label) if make_issues else set()

    for skill_path, fm in sourced:
        skill_name = skill_path.parent.name
        pointers, declares_no_code, bare_names, malformed, evidence = extract_code_pointers(skill_path)
        if evidence:
            # PV-08, metric. The exemption's use is reported so it can never be
            # a silent way to drop a pointer — see EVIDENCE_PREFIX_RE.
            tally["evidence_paths_skipped"] += len(evidence)
            findings.append(Finding("PV-08", f"skills/{skill_name}/SKILL.md",
                                     f"{len(evidence)} path(s) marked `evidence:` under "
                                     f"PIPELINE.md rule 6's evidence exemption — quoted as "
                                     f"evidence of a defect, not verified: "
                                     f"{', '.join(evidence)}",
                                     severity="metric", extra={"reason": "evidence-path-exempt"}))
        if malformed:
            findings.append(Finding("PV-07", f"skills/{skill_name}/SKILL.md",
                                     f"{len(malformed)} pointer(s) contain whitespace inside the path — a "
                                     f"code span broken across a hard wrap. Rewrite on one line: "
                                     f"{', '.join(malformed)}",
                                     severity="check-errored", extra={"reason": "malformed-pointer"}))
            tally["check_errored"] += 1
        if bare_names:
            # PV-06 IS A DEFECT, NOT A METRIC. Reclassified 2026-08-09.
            # It was booked as informational on the reading that a bare
            # filename is merely *unverifiable*. It is worse than that: it is
            # AMBIGUOUS, and ambiguity resolves silently and wrongly.
            # `gemini.js` names two real, different files in smart-archive —
            # `api/gemini.js` (a proxy) and `src/api/gemini.js` (a client).
            # A rebuilder following that pointer lands in one of them with no
            # signal that the other exists, and confidence is the damage. An
            # unresolvable pointer stops a reader; an ambiguous one does not.
            tally["skills_with_unrooted_filenames"] += 1
            tally["unrooted_filenames"] += len(bare_names)
            findings.append(Finding("PV-06", f"skills/{skill_name}/SKILL.md",
                                     f"{len(bare_names)} filename(s) cited with no directory, so each may "
                                     f"name more than one real file and a reader cannot tell which: "
                                     f"{', '.join(bare_names)}",
                                     extra={"reason": "unrooted-filename"}))
        if not pointers:
            if declares_no_code:
                # The author stated there is no code to point at, which
                # SPEC-0 §9.4 requires them to do. Nothing to verify, and
                # that is the correct outcome, not a defect.
                findings.append(Finding("PV-05", f"skills/{skill_name}/SKILL.md",
                                         "declares no code pointer (`Code lives at: nowhere`) — "
                                         "nothing to verify, per SPEC-0 §9.4",
                                         severity="metric", extra={"reason": "declared-no-code"}))
                tally["skills_declaring_no_code"] += 1
                continue
            if evidence:
                # PV-02'S MESSAGE WAS WRONG IN THIS STATE (RECS-S5 §S5-10,
                # RB-14, Run C §C2). It told the reader to add a code span
                # that is already there: `pointers` came back empty because
                # every `Code lives at:` path was marked `evidence:` and
                # skipped by rule 6's exemption (see PV-08 above), not
                # because none was written. The old message did not know
                # PV-08 exists; this one names it.
                findings.append(Finding("PV-02", f"skills/{skill_name}/SKILL.md",
                                         "sources this project but every `Code lives at:` pointer "
                                         "is marked `evidence:` and skipped under PIPELINE.md rule "
                                         "6's exemption — nothing remains to verify; see PV-08 above "
                                         "for what was exempted",
                                         severity="check-errored"))
            else:
                findings.append(Finding("PV-02", f"skills/{skill_name}/SKILL.md",
                                         "sources this project but has no parseable `Code lives at:` "
                                         "pointer — a path must be written as a markdown code span",
                                         severity="check-errored"))
            tally["check_errored"] += 1
            continue
        for pointer in pointers:
            tally["pointers_examined"] += 1
            ok, detail = resolve_pointer(project_root, pointer, sibling_repos, repo_name, project,
                                         brain_clone_dir=brain_clone_dir)
            if ok:
                tally["resolved"] += 1
                continue
            if ok is None:
                tally["not_attempted"] += 1
                # NOT-ATTEMPTED. Emitted, never silent: an omitted pointer and
                # a verified one look identical in an artifact, and only one of
                # them is a gap.
                findings.append(Finding("PV-04", f"skills/{skill_name}/SKILL.md",
                                        detail, severity="metric",
                                        extra={"reason": "unattributable-repo", "pointer": pointer}))
                continue
            tally["broken"] += 1
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

    return findings + [_tally_finding(project, tally)], False, tally


def _version_finding(brain_clone_dir: Path) -> Finding:
    """PV-09, ADDED 2026-08-10 (RUN J). Emitted every run, so a deployed copy
    that has drifted from the template announces itself HERE instead of being
    inferred two days later from a finding that would not clear.

    Compares THIS FILE's own `TEMPLATE_VERSION` — which travels with it
    automatically, since a deployed copy IS this file — against the version
    string in the aviv-brain clone this run already made to read the skills
    it verifies (`brain_clone_dir`, zero extra cost). A mismatch is a real
    `finding` (it moves the exit code, same as a broken pointer): a stale
    checker can under-report defects and over-report them at once, so it is
    not merely informational once it is known."""
    remote_path = brain_clone_dir / TEMPLATE_PATH_IN_BRAIN
    if not remote_path.exists():
        return Finding("PV-09", "-",
                        f"version check not-attempted: deployed as {TEMPLATE_VERSION}, but the "
                        f"brain clone has no {TEMPLATE_PATH_IN_BRAIN.as_posix()} to compare against "
                        f"(older brain snapshot, predates this check)",
                        severity="metric",
                        extra={"reason": "no-template-to-compare", "deployed_version": TEMPLATE_VERSION})
    remote_text = remote_path.read_text(encoding="utf-8", errors="replace")
    m = TEMPLATE_VERSION_RE.search(remote_text)
    if not m:
        return Finding("PV-09", "-",
                        f"version check not-attempted: deployed as {TEMPLATE_VERSION}, but the brain "
                        f"clone's {TEMPLATE_PATH_IN_BRAIN.as_posix()} carries no TEMPLATE_VERSION to "
                        f"compare against",
                        severity="metric",
                        extra={"reason": "no-version-in-template", "deployed_version": TEMPLATE_VERSION})
    template_version = m.group(1)
    if template_version == TEMPLATE_VERSION:
        return Finding("PV-09", "-", f"deployed script in sync with the brain template: {TEMPLATE_VERSION}",
                        severity="metric",
                        extra={"reason": "in-sync", "deployed_version": TEMPLATE_VERSION})
    return Finding("PV-09", "-",
                    f"deployed script is STALE — running {TEMPLATE_VERSION}, aviv-brain's template is "
                    f"now {template_version}. Re-copy automation/checks/project_verify.py and _lib.py "
                    f"from aviv-brain into this repo's automation/brain_verify/.",
                    extra={"reason": "stale-deployed-copy", "deployed_version": TEMPLATE_VERSION,
                           "template_version": template_version})


def _tally_finding(project: str, tally: dict) -> Finding:
    """The denominator, written into the artifact as a record of its own.

    Emitted on EVERY exit path, including the ones that checked nothing — a
    tally of all zeros with `skills_sourced: 0` is a different fact from no
    tally at all, and the whole point of A3 is that those two must never look
    alike again. severity=metric, so it can never move the exit code."""
    return Finding(
        "PV-TALLY", "-",
        (f"tally for source: {project} — "
         f"{tally['skills_sourced']} skill(s) sourced; "
         f"{tally['pointers_examined']} pointer(s) examined: "
         f"{tally['resolved']} resolved, {tally['broken']} broken, "
         f"{tally['not_attempted']} not-attempted; "
         f"{tally['skills_declaring_no_code']} skill(s) declare no code; "
         f"{tally['unrooted_filenames']} unrooted filename(s) across "
         f"{tally['skills_with_unrooted_filenames']} skill(s); "
         f"{tally['evidence_paths_skipped']} evidence path(s) skipped; "
         f"{tally['check_errored']} check-error(s)"),
        severity="metric", extra={"reason": "tally", **tally})


def summary_line(project: str, tally: dict, findings: list[Finding]) -> str:
    """The one line a human reads without opening the artifact.

    It must answer three questions the old `N finding(s)` could not: how much
    was attempted, how much failed, and whether the harness itself is healthy.
    Findings, check-errors and metrics are named separately here for the same
    reason they are separated in the exit code — see main()."""
    n_find = sum(1 for f in findings if f.severity == "finding")
    n_err = sum(1 for f in findings if f.severity == "check-errored")
    n_metric = sum(1 for f in findings if f.severity == "metric")
    return (
        f"project_verify ({project}): "
        f"{tally['skills_sourced']} skills, {tally['pointers_examined']} pointers "
        f"[{tally['resolved']} resolved / {tally['broken']} broken / "
        f"{tally['not_attempted']} not-attempted] "
        f"+ {tally['skills_declaring_no_code']} declare-no-code, "
        f"{tally['unrooted_filenames']} unrooted, "
        f"{tally['evidence_paths_skipped']} evidence-marked "
        f"|| {n_find} finding(s), {n_err} check-error(s), {n_metric} metric(s)"
    )


# Exit codes. A BITMASK, not a ladder — split 2026-08-09 because `metric`,
# `check-errored` and a real broken pointer all exited 1, so the exit code
# carried one bit of information ("something") where three were needed.
# A metric NEVER contributes: a tally line is not a defect.
EXIT_CLEAN = 0
EXIT_FINDINGS = 1        # at least one real defect in the library's files
EXIT_CHECK_ERRORED = 2   # the harness could not answer — a fault in the CHECK
EXIT_BOTH = 3
EXIT_MISSING_SECRET = 78  # unchanged; setup gap, not a verdict


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
                     help="repeatable, and NO LONGER THE PRIMARY SOURCE — the sibling "
                          "set now comes from the tracked project config (see "
                          "--project-config). These are UNIONED on top of it, for a "
                          "repo the config does not know about yet. Another repository "
                          "belonging to the SAME `source:` project: a pointer whose "
                          "leading segment names one is recorded not-attempted instead "
                          "of broken, because this checkout is not that repo and has no "
                          "evidence either way. Declare every sibling: an undeclared one "
                          "produces a false BROKEN, and can produce a false RESOLVED.")
    ap.add_argument("--project-config", type=Path, default=None,
                     help="the tracked JSON declaring which repositories each project "
                          f"spans. Defaults to <brain-clone-dir>/{DEFAULT_PROJECT_CONFIG.as_posix()}, "
                          "i.e. the brain's own copy, so the declaration has ONE home and "
                          "a re-run does not depend on what the last operator remembered. "
                          "An unknown project, or a project with no `repos` array, is a "
                          "hard named failure — never a silent empty sibling set.")
    ap.add_argument("--repo-name", default="",
                     help="this checkout's own repository name, as skill pointers spell "
                          "it. Defaults to the project-root directory name.")
    args = ap.parse_args()

    repo_name = args.repo_name or args.project_root.resolve().name
    config_path = args.project_config or (args.brain_clone_dir / DEFAULT_PROJECT_CONFIG)

    # CLONE BEFORE READING THE DECLARATION. FIXED 2026-08-10 (RUN J), and it
    # is a real bug the deploy-and-run proof for J1/J2 caught, not a style
    # choice: `config_path` defaults to living INSIDE `brain_clone_dir`, but
    # on a fresh CI runner nothing has cloned it yet at this point. The first
    # live run against Notebook-X after this file's own A5/A6 fixes landed
    # failed closed on exactly this — `check-errored`, "project config not
    # found at '/tmp/aviv-brain/...'" — before a single pointer was examined.
    # Local testing never caught it because a local run reused an
    # already-cloned directory from a prior invocation.
    try:
        clone_brain(args.brain_repo_url, args.token_env, args.brain_clone_dir)
    except MissingSecretError as e:
        finding = Finding("PV-01", "-",
                          f"not-attempted: required secret '{e.name}' is not set — "
                          f"nothing in this project could be verified against aviv-brain this run",
                          severity="metric", extra={"reason": "no-token", "token_env": e.name})
        out_stream = args.json_out.open("w", encoding="utf-8") if args.json_out else sys.stdout
        try:
            emit_jsonl([finding], out_stream)
        finally:
            if args.json_out:
                out_stream.close()
        return die_missing_secret(e.name)
    except subprocess.CalledProcessError as e:
        finding = Finding("PV-01", "-", f"could not clone aviv-brain: {e.stderr.strip()[:300]}",
                          severity="check-errored")
        out_stream = args.json_out.open("w", encoding="utf-8") if args.json_out else sys.stdout
        try:
            emit_jsonl([finding], out_stream)
        finally:
            if args.json_out:
                out_stream.close()
        print(f"project_verify ({args.project}): FAILED CLOSED — could not clone aviv-brain", file=sys.stderr)
        return EXIT_CHECK_ERRORED

    # READ THE DECLARATION BEFORE ANYTHING IS MEASURED. If it cannot be read,
    # this run produces no numbers at all — a Route C run with the wrong
    # sibling set does not produce slightly-wrong numbers, it produces
    # confident BROKEN records about files in repositories it never opened,
    # and opens issues under them.
    try:
        declared = load_project_repos(config_path, args.project)
        siblings = siblings_of(declared, repo_name, args.project) | frozenset(args.sibling_repo)
    except UnknownProjectError as e:
        finding = Finding("PV-01", "-",
                          f"sibling declaration unavailable: {e}",
                          severity="check-errored",
                          extra={"reason": "unknown-project", "project": args.project,
                                 "config": str(config_path)})
        out_stream = args.json_out.open("w", encoding="utf-8") if args.json_out else sys.stdout
        try:
            emit_jsonl([finding], out_stream)
        finally:
            if args.json_out:
                out_stream.close()
        print(f"project_verify ({args.project}): FAILED CLOSED — {e}", file=sys.stderr)
        return EXIT_CHECK_ERRORED

    # The sibling set is part of the result, not part of the setup. Printed so
    # a reader of the run log can re-derive the numbers without knowing what
    # the operator typed — which is the whole defect this replaced.
    print(f"project_verify ({args.project}) [{repo_name}]: siblings from "
          f"{config_path} -> {sorted(siblings) or '(none declared)'}", file=sys.stderr)

    findings, missing_secret, tally = run(
        project=args.project,
        project_root=args.project_root.resolve(),
        brain_clone_dir=args.brain_clone_dir,
        brain_repo_url=args.brain_repo_url,
        token_env=args.token_env,
        make_issues=not args.no_issues,
        sibling_repos=siblings,
        repo_name=repo_name,
    )

    out_stream = args.json_out.open("w", encoding="utf-8") if args.json_out else sys.stdout
    try:
        emit_jsonl(findings, out_stream)
    finally:
        if args.json_out:
            out_stream.close()

    print(summary_line(args.project, tally, findings), file=sys.stderr)

    if missing_secret:
        # The finding above already recorded not-attempted; THIS is the
        # loud, explicit failure the brief also requires — both happen.
        return die_missing_secret(args.token_env)

    # SEVERITY IS SPLIT ACROSS THE EXIT CODE (2026-08-09).
    # `a metric was emitted`, `the checker could not answer` and `a pointer in
    # the library is broken` are three different situations that demand three
    # different responses, and all three used to exit 1. A caller reading only
    # the exit code and the summary line can now tell them apart without
    # opening the artifact — which is the whole requirement, because in
    # practice nobody opens the artifact.
    code = EXIT_CLEAN
    if any(f.severity == "finding" for f in findings):
        code |= EXIT_FINDINGS
    if any(f.severity == "check-errored" for f in findings):
        code |= EXIT_CHECK_ERRORED
    return code


if __name__ == "__main__":
    raise SystemExit(main())
