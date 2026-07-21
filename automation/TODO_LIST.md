# Automation TODO List

Backlog for unattended Claude Code sessions (twice daily). Pick ONE item per
session, start to finish. Before starting: check `automation/NEEDS_YOUR_REVIEW.md`
— if an item is blocked on something there, skip it and pick the next one.
Always run `node .github/scripts/validate-json.js` and, if `data/*.json` was
touched, `node .github/scripts/health-check.js` before committing. Never push
to `master` — commit locally and stop.

---

### TODO-001 — Client-side parser + UI for CAPABILITY_SUGGESTION / LEARNED_SOURCE blocks

**Description:** `worker.js`'s system prompt (lines 297-306) instructs Claude
to append optional `CAPABILITY_SUGGESTION: {...}` / `LEARNED_SOURCE: {...}`
JSON lines after a `---` separator in AI Search / Solve-a-Case responses.
Confirmed via grep: zero client-side handling exists anywhere in `index.html`
— these blocks currently render as raw visible text at the end of chat
messages. Build a parser (in `renderMarkdown()`, `index.html:2325`, or a
post-processing pass on the streamed message) that: (1) detects the
`---\nCAPABILITY_SUGGESTION: {...}` / `LEARNED_SOURCE: {...}` pattern, (2)
strips it from the visible bubble text, (3) renders a small dismissible card
(model it on `renderBookmarkBars()`, `index.html:3220`) showing the parsed
summary/reason and a "File this" button.

**Files/areas:** `index.html` (new parser function, new card markup + CSS
near the `.bookmark-bar` styles).

**Definition of done:** the raw block text never appears in a chat bubble;
the card renders with the parsed fields; the "File this" button is present
but may show a "not wired up yet" state or fall back to copy-to-clipboard
until the credential decision below lands — do not call GitHub directly from
the browser. No `data/*.json` touched, so `validate-json.js`/`health-check.js`
are unaffected — just confirm `index.html` still loads locally
(`python -m http.server 8080`) and a test message with a mock block renders
correctly.

**Complexity:** M

**Dependency:** The actual Issue-filing/GitHub-write action is blocked on
`NEEDS_YOUR_REVIEW.md` → "GitHub write-credential decision". The parser + UI
half is not blocked and can be shipped independently.

---

### TODO-002 — Route AI-suggested URLs into `flagged/pending-review.md`

**Description:** `flagged/pending-review.md` is currently an empty table —
CLAUDE.md's Source Flagging rules describe this as a manual process, and
CURRENT-SPEC.md confirms nothing automatically routes AI-suggested URLs into
it. Once TODO-001's parser exists, a `LEARNED_SOURCE` block's "File this"
action should append a row (URL, suggested field, reason, date) to
`flagged/pending-review.md` — never write straight to `data/*.json` (per the
quarantine rule).

**Files/areas:** `flagged/pending-review.md` (new rows via the mechanism),
possibly a small GitHub Action or Worker-side call for the actual write.

**Definition of done:** a filed suggestion produces a new row matching the
existing table format in `pending-review.md`; `data/*.json` is never touched
directly by this flow; `validate-json.js`/`health-check.js` still pass.

**Complexity:** M

**Dependency:** TODO-001 (shares the parser) + `NEEDS_YOUR_REVIEW.md` →
"GitHub write-credential decision" (same credential question).

---

### TODO-005 — Activate `powershell` content module

**Description:** `data/modules.json` registers `powershell` as
`"status": "coming-soon"` pointing at `data/powershell.json`, which does not
exist on disk (confirmed). Author 15-25 entries following the bilingual
command-entry schema in CLAUDE.md ("Bilingual Schema"), matching the density
of existing active modules (linux has 42, cmd has 25). Choose `cat` values
appropriate to PowerShell (e.g. `process`, `system`, `network`, `user` reusing
the existing `cmd.json` category set, or propose a small new set) and add
them to `CATEGORY_MAP` in `.github/scripts/validate-json.js` plus
`categories`/`categories_he` in `modules.json` if new categories are
introduced. Every `source_url` must be on the CLAUDE.md Rule 7 approved-domain
allowlist (`learn.microsoft.com`/`docs.microsoft.com`/`ss64.com` are strong
fits here) — if a needed source isn't on the list, stop and add it to
`NEEDS_YOUR_REVIEW.md` rather than deciding unilaterally.

**Files/areas:** `data/powershell.json` (new), `data/modules.json` (flip
status + categories), `.github/scripts/validate-json.js` (if new categories).

**Definition of done:** `node .github/scripts/validate-json.js` and
`node .github/scripts/health-check.js` both pass; `modules.json` status is
`"active"`; tab renders and filters correctly when checked locally
(`python -m http.server 8080`).

**Complexity:** M

---

### TODO-006 — Activate `cloud` content module

**Description:** Same pattern as TODO-005 for `data/cloud.json` (currently
missing). Notebook-X's `kb-cloud-devops` notebook (49.5 KB, 9 sections, 47
commands, confirmed in this session's Notebook-X investigation) can be used
as a reference/outline when picking topics (AWS/Azure/GCP basics, Docker,
CI/CD, monitoring) — but per CLAUDE.md's Source Flagging rules, Notebook-X
content itself is never a valid `source_url`; each entry still needs its own
official-doc citation from the approved list (`cloudflare.com`, or a
to-be-approved AWS/Azure/GCP official-docs domain — if none of the current
approved domains fit, flag the needed domain in `NEEDS_YOUR_REVIEW.md` instead
of adding it unilaterally).

**Files/areas:** `data/cloud.json` (new), `data/modules.json`,
`.github/scripts/validate-json.js` (if new categories).

**Definition of done:** same as TODO-005.

**Complexity:** M

---

### TODO-007 — Activate `security` content module

**Description:** Same pattern as TODO-005 for `data/security.json`
(currently missing). Notebook-X's `kb-cybersecurity` notebook (25.1 KB, 8
sections, confirmed complete) covers core security principles, threat
landscape, auth/MFA, encryption, network+endpoint security, incident
response, and hardening checklists — a good outline for topic selection, but
(same caveat as TODO-006) it is not itself a citable `source_url`; use it only
to decide what to cover, and cite official sources per entry.

**Files/areas:** `data/security.json` (new), `data/modules.json`,
`.github/scripts/validate-json.js` (if new categories).

**Definition of done:** same as TODO-005.

**Complexity:** M

---

### TODO-008 — Activate `docker` content module

**Description:** Same pattern as TODO-005 for `data/docker.json` (currently
missing). Container/Docker basics, Dockerfile, docker-compose, common
troubleshooting.

**Files/areas:** `data/docker.json` (new), `data/modules.json`,
`.github/scripts/validate-json.js` (if new categories).

**Definition of done:** same as TODO-005.

**Complexity:** M

---

### TODO-009 — Activate `cicd` content module

**Description:** Same pattern as TODO-005 for `data/cicd.json` (currently
missing). GitHub Actions, pipeline basics, deployment workflows — this repo's
own `.github/workflows/*.yml` are a working example set (not a citable
source, just useful local color) for what a CI/CD reference module might
practically cover.

**Files/areas:** `data/cicd.json` (new), `data/modules.json`,
`.github/scripts/validate-json.js` (if new categories).

**Definition of done:** same as TODO-005.

**Complexity:** M

---

### TODO-010 — Activate `casestudies` content module

**Description:** `data/modules.json` registers `casestudies` with
`"filter_type": "casestudy"` — a filter type not shared with any active
module, so this one likely needs its own rendering path/schema rather than
reusing the command-card schema verbatim. Before authoring content, check
whether `index.html` has any existing `filter_type === 'casestudy'` handling
(a quick grep shows none currently) — this task may need a small schema
proposal (bilingual case-study fields: scenario, diagnosis steps, resolution)
in addition to content, not just data authoring like the other modules.

**Files/areas:** `data/casestudies.json` (new schema + entries),
`data/modules.json`, `index.html` (new render path if none exists),
`.github/scripts/validate-json.js` (new validator function for the schema).

**Definition of done:** validator passes for the new schema; module renders
distinctly from command cards; status flipped to `active`.

**Complexity:** L — consider splitting into a schema-design sub-task and a
content-authoring sub-task rather than one session.

---

### TODO-011 — Activate `cli` content module

**Description:** Same pattern as TODO-005 for `data/cli.json` (currently
missing) — general CLI tools not already covered by `linux.json`/`cmd.json`/
`network.json` (e.g. `jq`, `curl` recipes beyond what's in `network.json`,
`tmux`, `git` CLI basics). Check for overlap with existing modules before
picking topics to avoid duplicate `id`s (validator enforces uniqueness
repo-wide already).

**Files/areas:** `data/cli.json` (new), `data/modules.json`,
`.github/scripts/validate-json.js` (if new categories).

**Definition of done:** same as TODO-005.

**Complexity:** M

---

### TODO-012 — Presentation/slide generation: feasibility & design (not code yet)

**Description:** Never built — zero repo-wide matches for
presentation/slide/pptx/jsPDF, confirmed. Before writing any code, scope: what
content would populate slides (workflow docs? command-card summaries?), what
output format fits the zero-build-step constraint, and whether the existing
print-based PDF export pattern from the Workflows tab (`generatePdf()` /
`window.print()` + `@media print`, `index.html`) can be adapted rather than
building something new. Produce a short recommendation, not code.

**Files/areas:** none yet.

**Definition of done:** a concrete go/no-go + approach recommendation exists,
sized into follow-up implementation TODOs if greenlit.

**Complexity:** S (scoping only)

---

### TODO-013 — Workflow document generation: feasibility & design (not code yet)

**Description:** Workflow *viewing* works (self-hosted since 2026-07-20:
fetch from this repo's own `workflows/` folder + render via
`renderMarkdown()`); generation doesn't — workflows are authored manually
today. Scope what "generation" should mean: an in-app editor that commits
new markdown straight into `workflows/` (this would need GitHub write
credentials — if this direction is chosen, add it to `NEEDS_YOUR_REVIEW.md`
before building), versus a client-side markdown template/preview tool the
user copies out and commits manually (no new credentials, fits current
architecture). Recommend a direction.

**Files/areas:** none yet.

**Definition of done:** a scoped recommendation, not code.

**Complexity:** S (scoping only)

**Dependency:** if the "in-app editor commits directly" direction is chosen,
that implementation is blocked on a new `NEEDS_YOUR_REVIEW.md` credential item.

---

### TODO-015 — PWA/offline support: scoping (not code yet)

**Description:** Mentioned in CURRENT-SPEC.md's Future Vision as an
unscheduled idea; no service worker or manifest exists today (confirmed no
`serviceWorker`/`manifest.json` references repo-wide). Scope what should work
offline — static command-card data and JSON obviously can; AI Search cannot
without the Worker. Recommend a caching strategy (likely a service worker
caching `index.html` + `data/*.json`, with a clear "AI Search needs a
connection" degraded state) before implementing.

**Files/areas:** none yet — eventual implementation would add `sw.js` +
`manifest.json` + registration code in `index.html`.

**Definition of done:** a scoped recommendation, not code.

**Complexity:** S (scoping only)

---

### TODO-016 — Contribution guide

**Description:** No `CONTRIBUTING.md` exists. Low priority per CLAUDE.md.
When picked up: write a short guide covering running locally
(`python -m http.server 8080`), the bilingual schema, the two validator
commands, and commit/PR conventions already implicit in CLAUDE.md's rules —
this should distill CLAUDE.md for contributors, not introduce new policy or
duplicate its full content.

**Files/areas:** new `CONTRIBUTING.md`.

**Definition of done:** doc exists, doesn't contradict CLAUDE.md, links to it
as the source of truth for rules.

**Complexity:** S

---

### TODO-017 — Accessibility: no `aria-live` region on streaming AI chat

**Description:** `#ai-chat-messages` (`index.html:2510`) has no `aria-live`
attribute, and the adjacent `#status-bar` (`index.html:1469`) is explicitly
`aria-live="off"` — confirmed via grep. Screen reader users get no
announcement when a new AI response streams in. Add an `aria-live="polite"`
live region (likely a small visually-hidden element updated once streaming
completes, not on every token delta — announcing every delta would be
unusable) so a completed response is announced.

**Files/areas:** `index.html` (new/updated live region near
`#ai-chat-messages`, streaming-completion handling around the
`sendAiMessage()` flow, `index.html:2808` area).

**Definition of done:** manual test with a screen reader (NVDA/VoiceOver)
confirms a new AI response is announced once, not per-token.

**Complexity:** S

---

### TODO-018 — Notebook-X integration: BLOCKED placeholder — RESOLVED 2026-07-21

**Resolution:** the architecture decision landed (repo mirror + client-side
selection, dumb Worker — see `NEEDS_YOUR_REVIEW.md`'s matching entry, now
marked RESOLVED) and was implemented in a directed, supervised session:
`.github/workflows/notebook-sync.yml` + `.github/scripts/sync-notebooks.js`
(weekly mirror sync), `index.html`'s `matchNotebooks()`/`buildNotebookContext()`
(client-side query matching + section retrieval, `notebook_context` request
field), and `worker.js`'s `getNotebookXContext()` removed in favor of
accepting the client-built context with a server-side size cap. Committed
locally, not yet merged to master. This do-not-touch marker no longer
applies — see CURRENT-SPEC.md "Recently Completed" for the full change list.
Original blocked-placeholder text kept below for history.

**Original description:** Do not extend the Notebook-X integration beyond the
existing (currently broken — see `NEEDS_YOUR_REVIEW.md`) index-injection
until the owner + architect resolve the architecture decision recorded in
`NEEDS_YOUR_REVIEW.md` → "Notebook-X Integration — Architecture Decision
Needed". This explicitly means: do not add a Cloudflare KV binding, do not
add any GitHub token/secret, do not change `getNotebookXContext()`'s fetch
pattern, and do not attempt to "fix" the silent 404 by guessing at a
solution.

**Files/areas:** none — this is a do-not-touch marker, not a task to execute.

**Definition of done:** N/A. This item is "resolved" only when the review
decision lands and a new, concrete TODO is created from whichever option is
chosen.

**Complexity:** N/A (blocked)

**Dependency:** `NEEDS_YOUR_REVIEW.md` → "Notebook-X Integration —
Architecture Decision Needed"

---

### TODO-019 — Add required `example` field to `quick_flags[]` schema

**Description:** `CLAUDE.md`'s Bilingual Schema section defines
`quick_flags[]` entries as `{flag, desc_he, desc_en}` with no field showing
the flag used in context. Add a new required `example` field: a full,
realistic command string demonstrating that flag in context (not bilingual —
follows the existing "no Hebrew in cmd-like fields" rule, same as `flag`
itself). Update the schema doc in `CLAUDE.md` and add enforcement to
`validate-json.js` (a new check inside the `quick_flags` validation block,
`.github/scripts/validate-json.js:160-175`): `example` must be a non-empty
string and must not contain Hebrew characters (reuse `hasHebrew()`).

**Files/areas:** `CLAUDE.md` (Bilingual Schema → `quick_flags[]` block),
`.github/scripts/validate-json.js` (`quick_flags` validation).

**Definition of done:** the schema doc lists `example` as required;
`validate-json.js` fails any `quick_flags[]` entry missing `example` or
containing Hebrew in it; existing `data/*.json` files will fail validation
until backfilled (expected — see TODO-020 through TODO-024).

**Complexity:** S

**Dependency:** none — this is a prerequisite for TODO-020 through TODO-024.

---

### TODO-020 — Backfill `quick_flags[].example` in `linux.json`

**Description:** Once TODO-019 lands, populate the new required `example`
field for every existing `quick_flags` entry in `data/linux.json`. Each
`example` should be a realistic, complete command string showing that
specific flag used in context (e.g. for a `-l` flag on `ls`, something like
`ls -l /var/log`).

**Files/areas:** `data/linux.json`.

**Definition of done:** `node .github/scripts/validate-json.js` passes with
the TODO-019 enforcement active; every `quick_flags[]` entry in this file
has a non-empty, Hebrew-free `example`.

**Complexity:** M

**Dependency:** TODO-019

---

### TODO-021 — Backfill `quick_flags[].example` in `cmd.json`

**Description:** Same pattern as TODO-020, for `data/cmd.json`.

**Files/areas:** `data/cmd.json`.

**Definition of done:** same as TODO-020, scoped to this file.

**Complexity:** M

**Dependency:** TODO-019

---

### TODO-022 — Backfill `quick_flags[].example` in `network.json`

**Description:** Same pattern as TODO-020, for `data/network.json`.

**Files/areas:** `data/network.json`.

**Definition of done:** same as TODO-020, scoped to this file.

**Complexity:** M

**Dependency:** TODO-019

---

### TODO-023 — Backfill `quick_flags[].example` in `1com.json`

**Description:** Same pattern as TODO-020, for `data/1com.json`.

**Files/areas:** `data/1com.json`.

**Definition of done:** same as TODO-020, scoped to this file.

**Complexity:** M

**Dependency:** TODO-019

---

### TODO-024 — Backfill `quick_flags[].example` in `mirtapbx.json`

**Description:** Same pattern as TODO-020, for `data/mirtapbx.json`.

**Files/areas:** `data/mirtapbx.json`.

**Definition of done:** same as TODO-020, scoped to this file.

**Complexity:** M

**Dependency:** TODO-019

---

### TODO-025 — Scope: visual redesign of Workflows/guide content rendering

**Description:** Flagged during manual review (2026-07-20), not urgent. The
Workflows tab's rendered guide content (`#workflow-detail-content`,
rendered via `renderMarkdown()`) currently reads as a bare list-with-headers
— plain headings, paragraphs, and tables with no additional visual
structure (no color-coding by section type, no callout/card styling for
tips vs. warnings, etc.). Scope a redesign that adds more color, structure,
and visual clarity to this rendering path, without touching the shared
`renderMarkdown()` used by AI chat responses (a Workflows-specific wrapper
or additional CSS scoped to `#workflow-detail-content` is likely the right
boundary). Produce a recommendation, not code.

**Files/areas:** none yet — eventual implementation would touch CSS scoped
to `#workflow-detail-content` (`index.html`) and possibly a light
post-processing pass on the rendered HTML.

**Definition of done:** a scoped recommendation exists (approach + rough
effort), sized into a follow-up implementation TODO if greenlit.

**Complexity:** S (scoping only)

**Priority:** Low — not urgent, flagged during manual review rather than
from a user complaint or bug.

---

## Completed

Items move here in full (not struck out in place) once merged to `master`
by an Auditor run, per `automation/DATA_CENTER_AUTOMATION_SPEC.md` §7.
Each entry keeps its original description and appends date completed plus
the branch/commit reference.

### TODO-014 — Fix `check-links.js` blind spot on 1COM/MirtaPBX source URLs

**Description:** `.github/scripts/check-links.js:13` hardcodes
`FILES = ['linux.json', 'cmd.json', 'network.json']` — confirmed `1com.json`
and `mirtapbx.json` (28 entries combined, every entry has a required
`source_url`) are never checked by the daily `link-check.yml` job. This is a
real coverage gap on two active, populated modules. Add both filenames to the
`FILES` array.

**Files/areas:** `.github/scripts/check-links.js`.

**Definition of done:** `node .github/scripts/check-links.js` reports
checking a higher unique-URL count including `1com.co.il`/`mirtapbx.com`/
`queuemetrics.com` entries; script still exits 0 when everything is reachable
(bot-blocked 401/403/429 responses are correctly treated as warnings, not
failures, per the existing `classify()` logic — don't change that behavior).

**Complexity:** S

**Completed:** 2026-07-21, branch `dc-auto-2026-07-21_023811`, merged into
`master` via commit `7ef66de` (merge commit "Merge dc-auto branch:
TODO-014") by the Run 2 (Auditor) session. Independently re-verified:
`node .github/scripts/check-links.js --summary` reports 105 unique URLs
checked post-merge (up from 96 pre-change), exit 0, same 6 pre-existing
broken links and 5 bot-blocked warnings (all unrelated to this change).

---

### TODO-004 — Bookmark browsing/management panel

**Description:** `saveBookmark()` (`index.html:3248`) persists
`{url, dateAdded}` entries to the `dc-bookmarks` localStorage key, but there
is no UI anywhere to view or delete the saved list — confirmed it's currently
write-only from the user's side. Add a "My Bookmarks" view (modal or small
panel, triggered from a visible button e.g. in the topbar) that reads
`getSavedBookmarks()` (`index.html:3212`), lists url + domain + dateAdded per
row, and lets the user remove entries (filter + re-save `dc-bookmarks`).

**Files/areas:** `index.html` (new panel markup + render/remove functions,
one new trigger button).

**Definition of done:** saved bookmarks are visible and individually
removable; empty-state message shown bilingually when there are none; no new
localStorage keys beyond the existing `dc-bookmarks`/`dc-dismissed-bookmarks`;
still zero network calls or credentials (matches CLAUDE.md's "client-side
only, no credentials" rule for this system).

**Complexity:** S

**Completed:** 2026-07-20, branch `dc-auto-2026-07-20_151157`, merged into
`master` via commit `ab196ac25e4df2be42a8cdcd81c687b4536c38d9` (merge commit
"Merge dc-auto branch: TODO-004") by the Run 2 (Auditor) session.

---

### TODO-003 — Copy-to-clipboard buttons on command-card usage rows

**Description:** `copyAiCode()` (`index.html:2388`) already implements
clipboard-copy with a "✓ Copied/הועתק" flash for AI-chat code blocks.
`renderCard()` (`index.html:1837`) renders each `usage[].cmd` into a
`.usage-cmd` div (`index.html:1858-1860`) with no copy affordance at all.
Add a copy button to each usage row reusing the same
`navigator.clipboard.writeText()` + flash-text pattern.

**Files/areas:** `index.html` (`renderCard()`, a new `copyUsageCmd()`
function or a shared helper factored out of `copyAiCode()`, CSS near
`.usage-cmd`, `index.html:457`).

**Definition of done:** every command card's usage rows have a working,
keyboard-accessible copy button (a real `<button>`, not a `div onclick`) in
both LANG states; existing card expand/collapse (`toggleCard()`,
`handleExpandKeydown()`) still works. Manually verify in browser: expand a
card, click copy, paste to confirm the clipboard content.

**Complexity:** S

**Completed:** 2026-07-20, isolated cherry-pick of just the `index.html`
change from branch `dc-auto-2026-07-20_125410` (commit `4db1415`) — the
branch's Push-Authorization checklist run had failed on item (a) because it
also carried unrelated stale `automation/NEEDS_YOUR_REVIEW.md` /
`automation/TODO_LIST.md` edits from before this session's automation build
(see `automation/NEEDS_YOUR_REVIEW.md` "TODO-003 branch left for manual
review" entry). Rather than merging the branch as-is, only `index.html` was
extracted onto a fresh branch off current `master` and merged via
`b3451b1105de671b38b2f423d0e77a60b94555cb` (merge commit "Merge
dc-todo003-cherry-pick: TODO-003 copy-to-clipboard buttons"). The original
`dc-auto-2026-07-20_125410` branch remains unmerged and is kept as
historical record.
