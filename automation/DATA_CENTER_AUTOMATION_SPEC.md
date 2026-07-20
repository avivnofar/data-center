# Data Center — Unattended Automation: Design Specification

*Designed in the data-center Project's automation-design chat, 2026-07-20.
This document is the source of truth for what the Claude Code implementation
session should build. It does not replace `CLAUDE.md` — once built, the
relevant rules from this spec must be folded into `CLAUDE.md` itself (see
§10).*

---

## 1. Purpose & Scope

An unattended automation that runs Claude Code against the `data-center`
repo's task backlog (`automation/TODO_LIST.md`), twice daily, without a
human present for either run. It works ONE repo — `data-center` — and does
not touch `data-center-archive`, `office-AI-agents`, or `Notebook-X`.

**Explicitly out of scope for this automation** (parked elsewhere, do not
decide or act on here):
- The Notebook-X integration architecture decision.
- Any change to the main app's architecture (`index.html`, `worker.js`)
  beyond what an individual approved TODO item calls for.

---

## 2. Schedule & Trigger

- Windows Task Scheduler, twice daily (times TBD by owner — was 2:30/7:30
  for the existing archive automation; data-center may reuse those times or
  pick its own — **Claude Code implementation session: ask the owner if not
  already specified**).
- The data-center automation runs **after** the existing archive-project
  automation finishes at each wake time (two scripts back-to-back per wake
  time, not a new independent schedule) — confirm the archive scripts'
  actual finish behavior before wiring the chain.

---

## 3. Two-Run Model

Each daily wake time is functionally identical (same script, same logic) —
**but Run 1 and Run 2 of the day play different roles**, matching the
existing archive automation's night/morning pattern:

### Run 1 — "Builder"

1. Read `automation/TODO_LIST.md` and `automation/NEEDS_YOUR_REVIEW.md`.
2. Select ONE eligible item per §4 selection logic below.
3. Check out a **fresh local branch** off `master`
   (e.g. `dc-auto-<STAMP>`).
4. Do the work end-to-end for that item per its Definition of Done.
5. Run `node .github/scripts/validate-json.js` (always) and
   `node .github/scripts/health-check.js` (if `data/*.json` was touched).
   Do not proceed past a failing validator — revert the item's changes and
   log it as failed instead.
6. Commit in small, logical increments (never a blanket `git add -A`; only
   stage files actually intended).
7. **Push the branch to origin.** Do NOT merge or push to `master`.
8. Update the state file (§5) and write a run-log entry (§8).

### Run 2 — "Auditor"

Run 2 is the *more careful, more responsible* half of the pair — it never
trusts Run 1's own "it passed" claim, it re-verifies independently.

1. If Run 1 (of that same day, or an unmerged branch from a prior day)
   produced a branch: check it out fresh.
2. **Re-run both validators independently** — do not rely on Run 1's log.
3. Check the diff against the **Push-Authorization Checklist** (§6) —
   every condition must hold, no partial credit.
4. **If all checks pass**: merge into `master` locally (`--no-ff`), run the
   validators one final time on the merged result, then push `master`.
   Do not delete the feature branch.
5. **If any check fails, or the item is excluded per §6**: leave the
   branch untouched and unpushed, write a clear explanation to
   `automation/NEEDS_YOUR_REVIEW.md` (what failed, which check, why) for
   the owner, and stop — do not attempt to fix it.
6. Whether or not there was a Run-1 branch to audit that day, Run 2 **also**
   performs the daily Audit Pass (§9) once per day.

**Open question for Claude Code to confirm with owner**: which of the two
daily runs is "Run 1" and which is "Run 2" — presumably the earlier one
(e.g. 2:30) is the Builder and the later one (7:30) is the Auditor, mirroring
archive's night/morning split, but confirm before hardcoding.

---

## 4. Backlog Selection Logic (Run 1)

Pick the **first eligible item**, in this priority order:

1. **Skip anything blocked** per `automation/NEEDS_YOUR_REVIEW.md` —
   currently: TODO-001's filing half, TODO-002 (fully), TODO-018 (fully).
2. **Skip TODO-005 through TODO-011 entirely** (content-module authoring —
   `powershell`, `cloud`, `security`, `docker`, `cicd`, `casestudies`,
   `cli`). **Paused pending the Notebook-X architecture decision** — do not
   author new knowledge-base entries for these modules until that decision
   lands, even though nothing in `NEEDS_YOUR_REVIEW.md` currently marks
   them blocked. (Claude Code: add an explicit entry to
   `NEEDS_YOUR_REVIEW.md` recording this pause — see §10.)
3. **Skip TODO-010 unconditionally** even once #2 above is eventually
   lifted — it's L-complexity and its own text calls for a schema-design
   sub-task split before content authoring; that's the owner's call, not
   an autonomous session's.
4. **Skip any item already marked "Completed"** (§7). Also skip any item
   whose most recent state-file entry (§5) for that ID — regardless of
   date, checked across all days, not just today — has status `"done"`,
   `"in-progress"`, or `"needs-review"`. A `"needs-review"` status (an
   Auditor already declined it) is a hard skip until a human explicitly
   re-queues it; a `"failed"` status is NOT a skip (a fresh attempt may
   succeed, but read the failure note first).
5. From what remains, prefer items in list order: TODO-003, 004, 014, 016,
   017, then TODO-001 (UI/parser half only), then TODO-012, 013, 015
   (scoping-only — produce a written recommendation, not code; see note
   below).
6. **If nothing is eligible**: log "no eligible item this run" and stop.
   Do not invent work.

**Note on TODO-012/013/015 (scoping-only items)**: these produce a
recommendation document, not a code diff. They still go through the
branch/commit/push-for-review flow (commit the recommendation doc), but by
nature they will almost never satisfy the Push-Authorization Checklist's
"matches Definition of Done" bar for an autonomous merge, since the DoD is
itself "a decision, sized into follow-up TODOs if greenlit" — expect these
to routinely land in the owner's review queue rather than auto-merging, and
that's correct behavior, not a bug.

---

## 5. State Tracking

A state file — e.g. `automation/state/dc_automation_state.json` — records,
per run:

```jsonc
{
  "last_run": "2026-07-19T23:30:00Z",
  "todo_history": [
    {
      "id": "TODO-017",
      "status": "done" | "failed" | "needs-review" | "in-progress",
      "branch": "dc-auto-2026-07-20_023000",
      "run": "builder" | "auditor",
      "date": "2026-07-20",
      "note": "short human-readable summary"
    }
  ]
}
```

This lets Run 1 skip already-attempted items and lets Run 2 find what to
audit, across both same-day runs and multi-day gaps. Selection in both
roles is based on each ID's **most recent** entry, not just today's —
otherwise a `"done"` or `"needs-review"` item from a prior day that never
got merged would look eligible again once its own date rolls off, and a
future Builder run could produce a second, competing branch for the same
item. Run 1 must not re-pick an ID whose latest entry is `"done"`,
`"in-progress"`, or `"needs-review"`; Run 2 must not re-audit an ID whose
`"run": "builder"`/`"status": "done"` entry already has a later
`"needs-review"` or `"merged"` entry for the same ID.

**"Most recent"/"latest" means array position, never the `"date"` field.**
`todo_history` is append-only — entries are never reordered or edited in
place — so the last entry for a given ID in the array is authoritative.
`"date"` is day-granularity only (no time-of-day); a Builder entry and a
same-day Auditor entry for the same ID (the normal case — see TODO-003 and
TODO-004 above) share a date and are only distinguishable by array order.
Similarly, `"last_run"` must be true UTC (`Z`-suffixed, converted from
local wall-clock time if needed, never just relabeled) — it is
informational only and not read by any selection logic, but an
inconsistent format there makes the file misleading to a human reading it
directly.

---

## 6. Push-Authorization Checklist (Run 2 gate)

Run 2 may merge-and-push to `master` **only if every one of these holds**.
This is a checklist, not a risk judgment — any single failure means: leave
local/unpushed, flag for owner, stop.

1. The diff touches **only** files listed in the TODO item's own
   "Files/areas" field — nothing outside stated scope.
2. **Zero** new or changed `source_url` values anywhere in the diff. (This
   alone excludes any content-module item even if §4's pause is later
   lifted for an individual module — a fresh owner decision would be needed
   to change this specific check, not just the pause.)
3. No `data/*.json` schema changes, no deletions of existing entries, no
   changes to `.github/workflows/`, `wrangler.toml`, or anything
   credential-adjacent.
4. Both validators pass clean on Run 2's own independent re-run.
5. The diff's actual content matches the item's stated Definition of Done
   — checked explicitly, not inferred from "build/validators passed."

---

## 7. `TODO_LIST.md` Bookkeeping

Add a `## Completed` section at the end of `automation/TODO_LIST.md`. When
an item is merged to `master` by Run 2, move its full entry there (don't
just strike it out in place), appending: date completed, branch/commit
reference. This keeps the active backlog list short and gives a visible
completion history in the same file contributors already read.

---

## 8. Logging & Reporting

- Raw logs: `automation/automation_logs/dc_run_YYYY-MM-DD_HHMMSS.log` —
  same pattern as the archive automation (full `claude` stdout via `>>`
  redirect, `====`/`----` section banners, `echo ... started/finished:
  %time%`).
- Human-readable run log: a `automation/DATA_CENTER_RUN_LOG.md`
  (mirroring `BURNDOWN_REVIEW.md`) — one dated entry per run, written for a
  human reviewer, containing: which TODO item, what changed and why, files
  touched, validator results, any manual verification still needed (e.g.
  TODO-017's screen-reader check), and the push/no-push outcome with
  reasoning if not pushed.
- Guardrail failures, exclusions hit, and "nothing eligible" runs still get
  a log entry — silence is not an acceptable outcome of a run.

---

## 9. Daily Audit Pass (once per day, on the Auditor run)

Independent of whatever Run 1 built that day, the Auditor run also performs
a standing audit, mirroring archive's `instructions_audit.txt` pattern.
Writes to a dedicated `automation/DATA_CENTER_AUDIT.md` (new dated section
appended each day, never overwritten — if a prior "needs attention" item
isn't yet resolved, it stays visible rather than silently dropping).

Checks:
1. **Code/data health** — validator results, any `source_url` reachability
   drift beyond what `link-check.yml` already covers, and whether
   `CURRENT-SPEC.md`'s claims still match actual code (the kind of drift
   the 2026-07-19 audit already caught once with the Notebook-X
   index-injection claim).
2. **Self-audit of prior automation runs** — do the last day or two of
   `DATA_CENTER_RUN_LOG.md` entries actually match what's really in the
   repo (item genuinely done vs. claimed done; anything pushed that
   shouldn't have been per §6; anything left as a stale local branch that
   should be flagged).

This pass is read-only except for appending to `DATA_CENTER_AUDIT.md`
itself — same one-file-exception pattern as archive's audit, and it may
push that one file directly to `master` (this is explicitly the same
approved exception archive already uses: audit output about state, not a
code or content change).

---

## 10. Required Documentation Updates (part of implementation, not optional)

The Claude Code implementation session must update, not just build scripts:

- **`CLAUDE.md`**: add a new section documenting the two-run model, the
  Push-Authorization Checklist (§6) as the specific, narrow exception to
  the existing "pause before pushing to master" default rule, and the
  TODO-005–011 pause.
- **`NEEDS_YOUR_REVIEW.md`**: add an entry (alongside the existing
  Notebook-X architecture item) stating TODO-005–011 are paused pending
  that decision and must not be authored until it resolves.
- **`CURRENT-SPEC.md`**: once the automation is built and verified working
  end-to-end, add a code-verified entry describing it, per that file's
  existing standard (only after real verification, not on completion of
  the build alone).
- **`automation/TODO_LIST.md`**: add the `## Completed` section (§7).

---

## 11. Guardrails (hard tool-level blocks, not just prompt instructions)

Both runs should block at the CLI level, not rely on prompt compliance
alone (mirroring archive's `--disallowedTools`):
`Bash(rm:*)`, `Bash(git push origin master*)`,
`Bash(git push --force*)`, `Bash(git reset --hard:*)`.
Run 1 additionally blocks `Bash(git merge*)` (it only ever produces a
branch). Run 2's merge-to-master step is the one place `git merge`/
`git push origin master` are allowed, and only after §6 passes.

---

## 12. Failure Handling

- **Run 1**: validator failure, or the item turning out bigger/more
  ambiguous than its entry suggested → revert that item's changes, log why
  in `DATA_CENTER_RUN_LOG.md`, do not push, move to nothing (do not
  auto-pick a second item same run).
- **Run 2**: any Push-Authorization Checklist failure → leave branch local/
  unpushed, write explanation to `NEEDS_YOUR_REVIEW.md`, stop. Never
  attempt to fix the underlying issue itself.
- Neither run ever force-pushes, hard-resets, or deletes a branch that
  failed — leave it for manual inspection.

---

## 13. Open Items for the Claude Code Implementation Session to Resolve

- Confirm real repo path on the Windows machine (analogous to archive's
  `C:\Users\97252\GITHUB\...`).
- Confirm which wake time (2:30 or 7:30) is Builder vs. Auditor, and the
  actual Task Scheduler entry names/times for the archive scripts this
  chains after.
- Confirm the branch-naming convention doesn't collide with anything
  already in use in the repo.
- Do a dry run (with no real TODO item picked, or the smallest S-item) end
  to end before treating the automation as production-ready, and report
  back before it's left to run unattended.
