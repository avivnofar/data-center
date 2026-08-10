"""
_lib.py — shared, stdlib-only helpers for the brain's read-only check suite.

Used by structural_checks.py, staleness_checks.py and project_verify.py.
Nothing in this file writes to disk, calls the network, or shells out to
anything other than `git log` (read-only) for a commit date.

Per SPEC-6 sect.6's failure table, adapted for a stateless CI job: a check
that cannot be answered is a FAILURE, not a shrug. Every public function
here either returns a value or raises — callers are expected to catch and
turn a raised exception into a `check-errored` finding rather than let a
whole run die on one bad file.
"""

from __future__ import annotations

import io
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Iterator, Optional


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------

@dataclass
class Finding:
    check_id: str
    path: str                    # repo-relative, forward slashes, no leading ./
    message: str                 # one line. Never a quoted file excerpt — rule 6
    line: Optional[int] = None
    severity: str = "finding"    # "finding" | "check-errored" | "metric"
    # "metric" = always-emitted informational output (e.g. SC-01's three-way
    # count, reported every run per SPEC-4a "whether or not they match").
    # It never trips the fail-closed exit code and a self-test fixture with
    # no violation must still see zero *findings* even though a metric line
    # is expected. See structural_checks.py main() and run_selftest.py.
    judgment: bool = False
    # True marks a finding as requiring human judgment rather than a
    # mechanical fact. Link C (draft_from_findings.py) NEVER acts on a
    # judgment finding, regardless of its check_id — "a finding B marked
    # judgment is never actioned" is enforced here as well as by C's own
    # explicit check_id allowlist, belt and suspenders.
    extra: dict = field(default_factory=dict)

    def to_json(self) -> str:
        d = {
            "check_id": self.check_id,
            "path": self.path,
            "message": self.message,
        }
        if self.line is not None:
            d["line"] = self.line
        if self.severity != "finding":
            d["severity"] = self.severity
        if self.judgment:
            d["judgment"] = True
        if self.extra:
            d["extra"] = self.extra
        return json.dumps(d, ensure_ascii=False, sort_keys=True)


class NonUTF8StreamError(Exception):
    """Raised by `_force_utf8` when a stream cannot be made to accept UTF-8
    and there is no way to work around it — see that function's docstring."""


def _force_utf8(stream):
    """Return a stream guaranteed to accept UTF-8 text, forcing the encoding
    on `stream` itself when possible.

    THIS IS THE FIX FOR RECS-S5 §S5-12 / RB-14: `emit_jsonl` used to write
    straight to `sys.stdout` with whatever encoding the console happened to
    have. On a `cp1255` console, the first finding containing a non-cp1255
    character (`→`) raised `UnicodeEncodeError` mid-stream — after thirty
    lines had already printed, so a partial scan read as a complete one and
    the run's own tally line never printed to say so. Every prior session
    worked around it by hand, with `PYTHONIOENCODING=utf-8` exported before
    the interpreter started — an environment setting the NEXT runner has no
    way to know to pass, and a run's own numbers should not depend on it.

    Three attempts, in order, and each is load-bearing:
      1. The stream is ALREADY UTF-8 (e.g. `--json-out`'s file, opened with
         `encoding="utf-8"` explicitly) — nothing to do, return it unchanged.
      2. `TextIOBase.reconfigure()` (Python 3.7+) changes the stream's
         encoding in place, which is what `PYTHONIOENCODING=utf-8` achieves
         from OUTSIDE the process — done here, from INSIDE it, so the setting
         is no longer something a caller has to remember to pass.
      3. If `reconfigure` is unavailable, wrap the stream's underlying byte
         `.buffer` in a fresh UTF-8 `TextIOWrapper`.

    If none of the three apply, this raises `NonUTF8StreamError` BEFORE a
    single finding has been written — never partway through, which is
    exactly the failure this function exists to remove. A caller that cannot
    write UTF-8 at all should fail loudly and immediately, not print thirty
    lines and then explode.
    """
    enc = (getattr(stream, "encoding", None) or "").lower().replace("-", "")
    if enc == "utf8":
        return stream
    reconfigure = getattr(stream, "reconfigure", None)
    if reconfigure is not None:
        try:
            reconfigure(encoding="utf-8")
            return stream
        except Exception:
            pass
    buffer = getattr(stream, "buffer", None)
    if buffer is not None:
        return io.TextIOWrapper(buffer, encoding="utf-8", newline="")
    raise NonUTF8StreamError(
        "emit_jsonl: this stream cannot be forced to UTF-8 (no .reconfigure() "
        "and no .buffer to wrap) — refusing to write anything, because a "
        "stream that fails partway through a run produces a truncated result "
        "that looks complete. Pass --json-out to write to a file instead."
    )


def emit_jsonl(findings: Iterable[Finding], stream=None) -> int:
    """Write one JSON object per line. Returns the count written.
    Per the run-harness failure table: 'nothing found' still writes output —
    an empty run and a run that never happened must not look identical, so
    callers should print a trailing summary line even when count is 0.

    The stream is forced to UTF-8 before the first write — see
    `_force_utf8()` — so a run's output no longer depends on
    `PYTHONIOENCODING` being set by whoever launched the process."""
    stream = _force_utf8(stream if stream is not None else sys.stdout)
    n = 0
    for f in findings:
        stream.write(f.to_json() + "\n")
        n += 1
    return n


# ---------------------------------------------------------------------------
# Frontmatter
# ---------------------------------------------------------------------------

_FRONTMATTER_RE = re.compile(r"\A---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)


class FrontmatterError(Exception):
    pass


def split_frontmatter(text: str) -> tuple[str, str, int]:
    """Return (raw_frontmatter, body, body_start_line).
    body_start_line is 1-indexed, for reporting.
    Raises FrontmatterError if no frontmatter block is found at all —
    that is itself a finding-worthy condition for any published file."""
    m = _FRONTMATTER_RE.match(text)
    if not m:
        raise FrontmatterError("no --- frontmatter block at top of file")
    raw = m.group(1)
    body = text[m.end():]
    body_start_line = text[: m.end()].count("\n") + 1
    return raw, body, body_start_line


_LIST_RE = re.compile(r"^\[(.*)\]$")


def parse_simple_yaml(raw: str) -> dict:
    """A deliberately narrow YAML-ish parser for the library's own
    frontmatter shape: flat `key: value` and `key: [a, b, c]` lines only.
    No nesting, no multi-line block scalars — the templates in skills/,
    personas/, behaviors/ and procedures/ do not use either, and a parser
    that silently accepted more than the format defines would hide a
    malformed file instead of flagging it.
    Raises FrontmatterError on a line it cannot parse as key: value."""
    out: dict[str, object] = {}
    for lineno, raw_line in enumerate(raw.splitlines(), start=1):
        line = raw_line.rstrip()
        if not line.strip():
            continue
        if line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise FrontmatterError(f"frontmatter line {lineno} has no ':' : {line!r}")
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            raise FrontmatterError(f"frontmatter line {lineno} has an empty key")
        m = _LIST_RE.match(value)
        if m:
            inner = m.group(1).strip()
            if not inner:
                out[key] = []
            else:
                out[key] = [v.strip().strip("'\"") for v in inner.split(",")]
        else:
            out[key] = value.strip("'\"")
    return out


def load_frontmatter(path: Path) -> tuple[dict, str, int]:
    """Read a file and return (frontmatter_dict, body, body_start_line).
    Raises FrontmatterError — callers decide whether that is a finding."""
    text = path.read_text(encoding="utf-8", errors="replace")
    raw, body, body_start_line = split_frontmatter(text)
    fm = parse_simple_yaml(raw)
    return fm, body, body_start_line


# ---------------------------------------------------------------------------
# Filesystem walking
# ---------------------------------------------------------------------------

def iter_markdown(root: Path, subdir: str, filename: Optional[str] = None) -> Iterator[Path]:
    base = root / subdir
    if not base.exists():
        return
    if filename:
        yield from sorted(base.glob(f"*/{filename}"))
    else:
        yield from sorted(base.rglob("*.md"))


def rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


# ---------------------------------------------------------------------------
# git history (read-only)
# ---------------------------------------------------------------------------

def git_first_commit_date(repo_root: Path, relpath: str) -> Optional[str]:
    """ISO date of the OLDEST commit touching relpath, or None if git is
    unavailable or the path has no history (e.g. not yet committed).
    Never raises — a git failure here degrades to 'unknown age', which
    callers report as a finding rather than a guess."""
    try:
        out = subprocess.run(
            ["git", "log", "--follow", "--format=%cI", "--", relpath],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except Exception:
        return None
    lines = [l for l in out.stdout.splitlines() if l.strip()]
    if not lines:
        return None
    return lines[-1]  # oldest is last with default (newest-first) log order


def git_head_commit(repo_root: Path) -> Optional[str]:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except Exception:
        return None
    v = out.stdout.strip()
    return v or None


# ---------------------------------------------------------------------------
# Path-token extraction (INDEX.md is read by regex, not by an assumed table
# schema — see the checks README for why)
# ---------------------------------------------------------------------------

def extract_path_tokens(text: str, prefix: str) -> list[str]:
    """Find every path-like token under `prefix/` (e.g. 'skills') mentioned
    anywhere in text — inside backticks, table cells, or plain prose.
    Deliberately format-agnostic: this library's INDEX.md table schema was
    not available to verify at delivery time (see checks README, 'assumptions
    not verified against the repo'). A regex over path tokens degrades
    gracefully if the table format changes; a fixed column parser breaks."""
    pat = re.compile(rf"{re.escape(prefix)}/([A-Za-z0-9_-]+)/")
    return sorted(set(pat.findall(text)))


# ---------------------------------------------------------------------------
# Append-only state (Link A) — "recency by append position, never by
# timestamp": a day-granularity date cannot distinguish two same-day
# entries, and comparing dates risks silently re-picking a declined item.
# Every write APPENDS a new run record; nothing already in the file is ever
# rewritten or removed. "Last seen" for a source is read off the most
# recent record that mentions it, found by walking the list from the end —
# a POSITION lookup, never a date comparison.
# ---------------------------------------------------------------------------

def load_state(state_path: Path) -> dict:
    if not state_path.exists():
        return {"runs": []}
    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except Exception:
        raise FrontmatterError(f"state file at {state_path} is not valid JSON — "
                                f"refusing to guess; fix or delete it by hand")


def append_state_run(state_path: Path, record: dict) -> dict:
    """Append `record` (must include a 'sources' dict) to the run history and
    write the whole file back. Returns the updated state. The write is
    read-modify-append-write, not a partial update — the caller is expected
    to have just loaded the freshest copy in the same process."""
    state = load_state(state_path)
    state["runs"].append(record)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
                           encoding="utf-8")
    return state


def last_seen_marker(state: dict, source_name: str) -> Optional[str]:
    """Walk the run history from the end (most recently appended first) and
    return the first marker recorded for `source_name`. Position-based, not
    date-based — see the module note above."""
    for run in reversed(state.get("runs", [])):
        sources = run.get("sources", {})
        if source_name in sources and sources[source_name].get("marker"):
            return sources[source_name]["marker"]
    return None


# ---------------------------------------------------------------------------
# automation/state/last-run.json — the missed-run detector's own state.
# A DIFFERENT file and a DIFFERENT record shape from last-scan.json above:
# every run of every link (scan/audit/draft) appends ONE flat record here,
# tagged with which trigger produced it (push/schedule/manual), so the
# watchdog check can answer "when did a schedule-triggered run last land",
# not "what has each source's HEAD moved to."
# ---------------------------------------------------------------------------

def runs_dir(state_path: Path) -> Path:
    """One directory of one-file-per-run records, beside last-run.json."""
    return state_path.parent / "runs"


def append_last_run(state_path: Path, link_id: str, trigger: str, exit_status: str,
                     timestamp: str) -> dict:
    """Record one run: {link_id, trigger, timestamp, exit_status}.

    ONE FILE PER RUN, never an append into a shared file.

    The first version rewrote a single last-run.json. Three jobs of one
    workflow run each appended to it and each pushed, and on 2026-08-08 the
    audit job's rebase hit `CONFLICT (content): automation/state/last-run.json`
    and its record was lost — after which retrying could not help, because the
    rebase was still in progress and every later attempt died on
    "Pulling is not possible because you have unmerged files."

    `skills/unattended-agent-runs` already carries this exact lesson:
    "parallel runs appending to one shared file are structurally guaranteed to
    conflict, not merely likely... one file per run, consolidated later by a
    single named owner." The chain committed the defect its own library
    documents. This is the library's own answer applied to it.

    Two writers now never touch the same path, so there is nothing to
    conflict. Readers consolidate via load_run_history().
    """
    record = {
        "link_id": link_id, "trigger": trigger,
        "timestamp": timestamp, "exit_status": exit_status,
    }
    d = runs_dir(state_path)
    d.mkdir(parents=True, exist_ok=True)
    # Filename carries the timestamp so a plain filename sort IS append order —
    # the same position-not-date discipline as the rest of this module, moved
    # into the name. Colons are illegal in Windows filenames; stripped.
    safe_ts = timestamp.replace(":", "").replace("+", "p")
    (d / f"{safe_ts}-{link_id}.json").write_text(
        json.dumps(record, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8")
    return load_run_history(state_path)


def load_run_history(state_path: Path) -> dict:
    """The consolidating reader for append_last_run's one-file-per-run records.

    Returns the same {"runs": [...]} shape every existing reader already
    expects, so most_recent_run/oldest_run/last_run_per_link are unchanged.

    Reads BOTH the legacy single last-run.json (records written before the
    2026-08-08 split, if any) and every file in runs/, legacy first, then
    filename-sorted — which is timestamp order, which is append order.
    """
    runs: list = []
    if state_path.exists():
        runs.extend(load_state(state_path).get("runs", []))
    d = runs_dir(state_path)
    if d.is_dir():
        for f in sorted(d.glob("*.json")):
            try:
                runs.append(json.loads(f.read_text(encoding="utf-8")))
            except Exception:
                raise FrontmatterError(f"run record at {f} is not valid JSON — "
                                        f"refusing to guess; fix or delete it by hand")
    return {"runs": runs}


def most_recent_run(state: dict, link_id: Optional[str] = None,
                     trigger: Optional[str] = None) -> Optional[dict]:
    """Walk from the end (most recently appended), optionally filtered by
    link_id and/or trigger. Position-based — the list is already in append
    order, so the first match walking backward IS the most recent one;
    nothing here compares timestamp strings to decide 'most recent.'"""
    for run in reversed(state.get("runs", [])):
        if link_id and run.get("link_id") != link_id:
            continue
        if trigger and run.get("trigger") != trigger:
            continue
        return run
    return None


def oldest_run(state: dict) -> Optional[dict]:
    """The first-ever appended record, any link/trigger — used as a
    bootstrap reference point (see watchdog_checks.py's docstring)."""
    runs = state.get("runs", [])
    return runs[0] if runs else None


def last_run_per_link(state: dict) -> dict:
    """Most recent run record per link_id, any trigger — for reporting 'how
    long since the last recorded run of each link', not just the schedule
    watchdog's own narrower question."""
    out: dict = {}
    for run in state.get("runs", []):
        out[run.get("link_id", "unknown")] = run  # later entries overwrite — forward order is fine here
    return out


# ---------------------------------------------------------------------------
# Write fence + declared-diff guard (Link C only)
# ---------------------------------------------------------------------------

class WriteFenceViolation(Exception):
    """Raised the instant a drafter tries to touch a path outside inbox/."""


class DiffOverrunError(Exception):
    """Raised when a drafter's actual diff exceeds what it declared before writing."""


def assert_under_inbox(repo_root: Path, target_path: Path) -> None:
    """Every write path begins with inbox/ — asserted PER FILE, AT WRITE
    TIME, not once at the top of a run. Call this immediately before every
    single write, from inside the write helper itself, never from the
    caller's judgment alone."""
    try:
        relative = target_path.resolve().relative_to(repo_root.resolve())
    except ValueError:
        raise WriteFenceViolation(f"path {target_path} is not even inside the repo checkout")
    if relative.parts[:1] != ("inbox",):
        raise WriteFenceViolation(
            f"refused to write outside inbox/: {relative.as_posix()}"
        )


def git_diff_stat(repo_root: Path, path_scope: Optional[str] = None) -> tuple[int, int, int]:
    """Returns (files_changed, insertions, deletions) for the current
    uncommitted working-tree diff, via `git diff --shortstat`, optionally
    scoped to `path_scope` (e.g. 'inbox/'). All zero if there is nothing to
    diff yet. Callers that only ever write under one subtree — like Link
    C's drafter — MUST pass path_scope, or an unrelated untracked file
    sitting anywhere else in the checkout gets counted against the budget."""
    diff_args = ["git", "diff", "--shortstat"]
    status_args = ["git", "status", "--porcelain=v1", "--untracked-files=all"]
    if path_scope:
        diff_args += ["--", path_scope]
        status_args += ["--", path_scope]
    out = subprocess.run(
        diff_args, cwd=str(repo_root),
        capture_output=True, text=True, timeout=15, check=False,
    )
    files = ins = dele = 0
    m = re.search(r"(\d+) files? changed", out.stdout)
    if m:
        files = int(m.group(1))
    m = re.search(r"(\d+) insertions?\(\+\)", out.stdout)
    if m:
        ins = int(m.group(1))
    m = re.search(r"(\d+) deletions?\(-\)", out.stdout)
    if m:
        dele = int(m.group(1))
    # untracked new files don't show in `git diff` at all — count them too,
    # scoped the same way.
    out2 = subprocess.run(
        status_args, cwd=str(repo_root),
        capture_output=True, text=True, timeout=15, check=False,
    )
    untracked = sum(1 for line in out2.stdout.splitlines() if line.startswith("??"))
    return files + untracked, ins, dele
