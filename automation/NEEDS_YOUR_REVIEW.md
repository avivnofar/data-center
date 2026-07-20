# Needs Your Review

Items in this file require explicit owner (and, where noted, architect) sign-off
before an autonomous session may act on them — per CLAUDE.md: new credentials,
new infrastructure/bindings, anything that would push to `master`, new
`source_url` domains, deletion/restructuring of existing entries, or genuinely
ambiguous design decisions. Autonomous sessions should skip these and work the
`automation/TODO_LIST.md` items instead.

---

## TODO-005 through TODO-011 — paused pending Notebook-X architecture decision

*(added 2026-07-20, when the twice-daily unattended automation was built —
see `automation/DATA_CENTER_AUTOMATION_SPEC.md` §4, §10)*

TODO-005 through TODO-011 (activating the `powershell`, `cloud`, `security`,
`docker`, `cicd`, `casestudies`, `cli` content modules) are paused and must
not be authored by any automated Builder run until the Notebook-X
integration architecture decision above resolves — even though nothing else
in this file previously marked them blocked. Several of these items'
`TODO_LIST.md` descriptions reference Notebook-X notebooks as topic-outline
references, and the underlying "what does citing/using Notebook-X content
actually look like" question is exactly what's undecided above. TODO-010
additionally stays excluded unconditionally once this pause lifts (its own
entry calls for an owner-approved schema-design split first).

This does not block TODO-001 through TODO-004 or TODO-014/016/017, which
have no dependency on this decision.

---

## Notebook-X Integration — Architecture Decision Needed

*(Part A investigation, 2026-07-19 — read-only, no code changed)*

### 0. Prior partial attempt: none found

Searched `git log --all` (repo-wide and scoped to `cloudflare-worker/`) for
anything referencing Notebook-X, sync, or KV from the last few days. The only
Notebook-X-related history is the existing, already-documented index-injection
feature — two commits (`455a087` and `7761e13`) with **identical timestamps and
identical diffs** (a duplicate/merge artifact from the same change, not two
separate attempts). No commit anywhere mentions a KV binding or a sync job.
`cloudflare-worker/wrangler.toml` defines nothing beyond `name`/`main`/
`compatibility_date` and a comment about the `ANTHROPIC_API_KEY` secret — no
KV namespace, no cron trigger. `worker.js` has no stub functions, no
commented-out fetch calls, and no unused env var references — `env.ANTHROPIC_API_KEY`
is the only env reference in the file (grepped for `env.`, `GITHUB_TOKEN`,
`GH_TOKEN`, `Authorization`, `process.env`). The `automation/` directory itself
held only two empty (0-byte) placeholder files when this session started —
nothing to recover there either. **Conclusion: there is no partial sync attempt
to build on — the "maybe requested yesterday" concern doesn't match repo state.**

### 1. Auth finding — the current fetch is live and silently broken

`getNotebookXContext()` (`cloudflare-worker/worker.js:70-95`) does a bare
`fetch()` against
`https://raw.githubusercontent.com/avivnofar/Notebook-X/main/notebooks/_index-public.json`
with **no `Authorization` header and no token anywhere in the codebase**.

Verified directly: `curl` of that exact URL, unauthenticated, from this
session returns **HTTP 404**. Notebook-X is a private repo; GitHub's
raw-content host returns 404 (not 401) for private-repo paths when
unauthenticated, by design, to avoid leaking repo existence. Because
`getNotebookXContext()` treats any non-`ok` response as "fail gracefully,
return `''`" (`worker.js:75`), **this has been silently failing in production
the whole time it's been live** — the "NOTEBOOK-X REFERENCE NOTEBOOKS" block
is never actually appended to the system prompt today. There is no error
anywhere to notice; it just quietly does nothing.

**Documentation drift found, not fixed (flagging per instructions):**
CURRENT-SPEC.md's "Architecture" section and "Recently Completed" list this as
a working, live feature. It is real, deployed code — but it is currently a
no-op against the actual (private) Notebook-X repo. Recommend CURRENT-SPEC.md
be corrected to reflect this once the owner/architect confirm the finding.

Whichever path is chosen below, **a GitHub credential of some kind is
unavoidable** — Notebook-X's privacy is the root blocker, not the fetch
pattern.

### 2. Corpus size

`_index-public.json` currently lists **12 notebooks**. Fetched via `gh api` using the CLI's own existing
`repo`-scoped GitHub auth (read-only investigation of a repo the same owner
already has access to — nothing was written, cached, or exposed anywhere).

| Notebook | Domain | Bytes |
|---|---|---:|
| kb-networking.json | networking | 73,100 |
| kb-ai-tools.json | ai | 70,552 |
| kb-mirtapbx.json | pbx | 48,186 |
| kb-cloud-devops.json | devops | 49,533 |
| kb-voip-sip.json | telecom | 47,583 |
| kb-firewall.json | security | 41,812 |
| kb-vpn.json | networking/security | 31,580 |
| kb-1com.json | telecom | 30,848 |
| kb-linux.json | linux | 28,289 |
| kb-bash.json | linux | 26,235 |
| kb-cybersecurity.json | security | 25,142 |
| kb-remote-access.json | it-support | 22,792 |
| **Total (12 files)** | | **495,652 bytes (~484 KB)** |

Range: 22.8 KB – 73.1 KB per notebook. Well within a single Worker request's
budget either as a live fetch or as KV reads.

### 3. Structural notes — no schema drift found

Checked 4 of 12 notebooks in full (`kb-linux`, `kb-firewall`, `kb-voip-sip`,
`kb-cybersecurity`) — schema is identical across all four:

- Top level: `id, name, version, format, domain, tags, description, language,
  createdAt, updatedAt, generatedBy, pinned, relatedNotebooks,
  relatedProjects, githubRawUrl, knowledgeBase, fileMemory, busSync,
  metadata, files, messages`
- `knowledgeBase`: `summary, lastWebVerified, webSources, sections, glossary,
  commonIssues, commands`
- `knowledgeBase.sections[]`: `id, title, content, subsections, tags,
  lastUpdated, sources` — richer than "id/title/content/tags" (also has
  `subsections`, `lastUpdated`, `sources`), but consistent across every
  notebook checked. No drift.

### 4. Two architecture options — undecided, needs owner + architect discussion

**(a) Extend the live-fetch pattern to pull full notebook content per-request**
- Pros: no new infrastructure; reuses the existing edge-cache pattern
  (5-min TTL already in place); simplest mental model; notebook edits are
  visible within ~5 minutes.
- Cons: still needs the GitHub-token problem solved (see finding #1); adds
  ~20–70 KB per fetched notebook to relevant requests (cost + latency on a
  free-tier Worker); ties request-path reliability to GitHub's uptime; no
  offline/degraded fallback beyond empty string.

**(b) Scheduled sync into a Cloudflare KV mirror**
- Pros: Worker reads become fast/local, no per-request GitHub round-trip;
  decouples user latency from GitHub availability; sync can run on a cadence
  matched to Notebook-X's actual ~weekly update rate instead of every request.
- Cons: needs a **new Cloudflare KV namespace binding** (new infra — sign-off
  required per CLAUDE.md); needs a **scheduled sync job** with its own
  read-only GitHub token, stored either as a GitHub Actions secret (if the
  sync runs from Notebook-X's or data-center's Actions) or a Cloudflare
  secret (if it runs as a Worker Cron Trigger) — either way, new credentials;
  introduces a staleness window between syncs.

Neither option is recommended here — both require the same underlying
GitHub-auth decision, and (b) additionally requires new Cloudflare
infrastructure. This is deliberately left for the owner + architect planning
chat, per this session's brief.

---

## GitHub write-credential decision — self-extension Issue-filing (blocks TODO-001, TODO-002)

`worker.js`'s system prompt (lines 297-306) already instructs Claude to emit
`CAPABILITY_SUGGESTION: {...}` and `LEARNED_SOURCE: {...}` blocks. Building the
client-side parser/UI for these (TODO-001) doesn't need new credentials, but
actually **filing** a GitHub Issue or **appending a row to
`flagged/pending-review.md`** (TODO-002) does — per CLAUDE.md, "Issue filing
must go through a server-side component (the Worker never gets GitHub write
access)". Concretely this means deciding: does the Worker get a narrowly
scoped (Issues:write only, or repo-contents:write only for pending-review.md)
GitHub PAT as a new Cloudflare secret, or does a separate small serverless
function/GitHub Action handle it instead? This is a new credential either way
and needs explicit sign-off before TODO-001/TODO-002 can be finished
end-to-end (the parser/UI half of TODO-001 can still be built and shipped
without this decision — see that TODO's notes).

---

## 2026-07-20 — TODO-003 branch left for manual review (Auditor Run 2)

**Branch:** `dc-auto-2026-07-20_125410` (pushed to origin, NOT merged to
`master`). **TODO item:** TODO-003 — copy-to-clipboard buttons on
command-card usage rows.

**Push-Authorization Checklist result:** independently re-verified all 5
items on the checklist in `automation/instructions_auditor.txt` §Push-
Authorization Checklist. Item **(a) FAILED**; items (b), (c), (d), (e) all
passed. Per the checklist ("ALL must hold... any single failure means do
not merge"), the branch was left untouched and unmerged.

**Item (a) — files touched must match TODO-003's own "Files/areas" field
(`automation/TODO_LIST.md`), nothing outside stated scope:**
TODO-003's stated scope is `index.html` only. The branch's actual diff
against `master` (`git diff master...dc-auto-2026-07-20_125410 --stat`)
touches 5 files, not 1:

- `index.html` — in scope, and the change itself is clean (see below).
- `automation/DATA_CENTER_RUN_LOG.md`, `automation/state/dc_automation_state.json`
  — standard per-run bookkeeping the Builder is separately instructed to
  produce (spec §5/§8); not treated as a scope violation on its own.
- `automation/NEEDS_YOUR_REVIEW.md` (+21 lines) and `automation/TODO_LIST.md`
  (+11 lines) — **not** bookkeeping. These add the TODO-005–011
  Notebook-X-pause note and the `## Completed` section scaffold required by
  `DATA_CENTER_AUTOMATION_SPEC.md` §10. The Builder's own commit message
  (`4db1415`, "carry forward pre-existing pause note + Completed section")
  says explicitly these were *pre-existing uncommitted edits from the
  automation-setup session*, unrelated to TODO-003, folded into this
  branch because they happened to be sitting in the working tree when the
  Builder run started. That is real scope creep under the checklist's
  literal wording, regardless of the content being otherwise legitimate
  and spec-mandated — it doesn't belong bundled into a TODO-003
  push-authorization decision.

**What was NOT wrong** (checked in full, for the record — items (b)-(e) all
passed independently):
- (b) Zero `source_url` values anywhere in the diff (grepped directly).
- (c) No `data/*.json` touched, no schema/workflow/`wrangler.toml`/
  credential-adjacent changes.
- (d) `node .github/scripts/validate-json.js` passes clean on a fresh
  checkout of the branch (all 7 JSON files valid); `health-check.js` not
  required since no `data/*.json` changed.
- (e) The `index.html` diff itself matches TODO-003's Definition of Done: a
  real `<button class="usage-copy-btn">` per usage row (not a styled
  `div`), a `copyUsageCmd()` function reusing `copyAiCode()`'s
  clipboard-write + flash-text pattern, bilingual label, 44px mobile
  touch-target rule, and it lives inside `.card-body` so it doesn't
  interfere with `toggleCard()`'s header click handler. This part looks
  ready to ship as-is.

**Recommended next step for the owner:** the `index.html` change and the
`automation/NEEDS_YOUR_REVIEW.md` / `automation/TODO_LIST.md` scaffolding
are both individually fine — they just shouldn't have shipped as one
push-authorization unit. Either (i) manually merge this branch (owner
judgment, not an autonomous decision) since the bundled content is legitimate,
or (ii) ask a future Builder run to split them: commit the setup-scaffolding
docs on `master` directly (outside any TODO branch) and keep TODO-003
branches to `index.html` only going forward.

**State/log follow-up:** `automation/state/dc_automation_state.json` and
`automation/DATA_CENTER_RUN_LOG.md` did not exist on `master` before this
run (they were only ever created on the Builder's branch, since Run 1 never
pushes to `master`). This Auditor run created both fresh on `master`,
carrying forward the Builder's original `TODO-003: done` entry plus a new
`TODO-003: needs-review` entry, and wrote a matching run-log entry — but
per the hard constraint that only `automation/DATA_CENTER_AUDIT.md` (and a
successful STEP-1 merge's doc/state files) may be pushed directly to
`master`, these are left as **uncommitted working-tree changes**, not
pushed and not even committed, pending owner review/commit.

---

## Standing reminders (not new findings, just carried forward from CLAUDE.md)

- No automation session may push to `master` — all sessions stop at a local
  commit and report back.
- No automation session may add a new `source_url` domain to the approved
  allowlist (CLAUDE.md Rule 7) without owner sign-off — `flagged/`'s
  quarantine flow governs specific URLs; a genuinely new *domain* is a bigger
  step than logging a URL as pending.
- `flagged/pending-review.md` is currently an empty table — nothing is
  awaiting review right now, so there's nothing actionable there this session.
