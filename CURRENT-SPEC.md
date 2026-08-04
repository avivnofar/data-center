# Data Center — Current Technical Specification

*Comprehensive feature audit 2026-07-19 (27 items, code-verified). Source
of truth for architecture and feature status. Rules and standards live in
`CLAUDE.md`; this file records what actually exists and works today.*

## Scope

General IT support knowledge base and AI assistant for IT professionals
(sysadmins, DevOps, helpdesk, students), bilingual Hebrew/English with
Hebrew-first RTL. Expanding toward cybersecurity content (a `security`
module is registered `coming-soon`). Vendor PBX modules (1COM, MirtaPBX)
remain as ordinary specialty content modules — the project is not scoped
to any one company. AI backend model: **`claude-sonnet-5`**.

## Architecture

- **Frontend**: `index.html` (~3,440 lines) — entire app in one file, no
  build step, no dependencies. Tabs are data-driven from
  `data/modules.json`; `init()` loads all data files via
  `Promise.all(fetch(...))`. Navigation is a fixed, collapsible 200px
  left sidebar (`#tab-nav`); AI Search is the default tab and the chat
  fills the main content area.
- **AI backend**: `cloudflare-worker/worker.js` (~500 lines) — the
  `data-center-api` Cloudflare Worker, a secure proxy holding the
  Anthropic API key as a Worker secret. Streams SSE responses
  (`streamAnthropicResponse()` re-streams Anthropic deltas), enforces an
  origin allowlist and 20 req/min/IP rate limit.
- **AI Search flow**: the app builds a small `db_context` from locally
  matched knowledge-base entries, plus a `notebook_context` from the
  Notebook-X mirror (see next bullet), and sends
  `{messages, mode, language, db_context, notebook_context, cli_mode, images}`
  to `/api/chat`; the Worker assembles a bilingual system prompt (appending
  both context strings, `notebook_context` capped server-side at 20 KB) and
  calls Claude with the `web_search` tool enabled (`max_uses: 2`).
- **Prompt caching (active since 2026-08-04)**: `systemBlocks()` returns the
  system prompt as an *array* of content blocks ordered static → dynamic,
  because Anthropic's cache is a prefix match. Two `cache_control: ephemeral`
  breakpoints: one after the universal base prompt (~1.9k tokens, static per
  language), one after the mode/CLI/CAPABILITIES section. `db_context` and
  `notebook_context` are the last block and are deliberately **not** cached —
  they change every request, so anything cached after them would be
  invalidated every time. The `tools` array renders before `system`, so it is
  covered by the first breakpoint for free. Whether it is actually engaging is
  observable, not assumed: `cache_creation_input_tokens` /
  `cache_read_input_tokens` on the `claude_api_usage` log line (see
  `cloudflare-worker/README.md`). Both zero across repeated identical-prefix
  requests means a silent invalidator crept in.
- **Notebook-X integration (repo mirror, decided + implemented 2026-07-21)**:
  `.github/workflows/notebook-sync.yml` mirrors the Notebook-X public index
  + all 12 notebooks verbatim into `data/notebooks/` weekly (read-only
  fine-grained PAT, `NOTEBOOKX_READ_TOKEN` secret). `index.html` loads the
  mirrored index into `DB.notebookIndex` at `init()`; `matchNotebooks()`
  scores it against the user's query (word-boundary matching + stopword
  filter, min relevance threshold — no match beats a wrong match) and
  `buildNotebookContext()` fetches up to 2 matched notebooks, selects only
  matching sections, and caps content at ~15 KB, truncating at section
  boundaries. The Worker is a dumb proxy for this — no fetching, no KV, no
  GitHub credentials on the Worker side. Supersedes the old
  `getNotebookXContext()` (confirmed silent no-op — unauthenticated fetch
  against the private repo always 404ed; deleted, not fixed).
- **Three AI modes** — strict radio, exactly one active
  (`AI_MODE_VALUES = ['search', 'diagnose', 'cli']`, stored in
  `localStorage` `dc-modes`): Free Search, Solve a Case, CLI Mode.
- **CLI Mode / CommandFlow**: `tools/commandflow/` — standalone "Terminal
  Academy" simulator (registered in `data/tools.json`, linked from the
  topbar) whose engine (`commandflow-core.js` + `commands.json`, 7
  platforms) also powers in-app CLI Mode at zero API cost, with
  fall-through to Claude for unmatched input.
- **Workflows tab**: self-hosted (2026-07-20) — renders bilingual workflow
  markdown from this repo's own `workflows/` folder, registered in
  `data/workflows.json` (loaded into `DB.workflows`, same pattern as
  `data/modules.json`). No external repo dependency; print-based PDF export
  unchanged. `data-center-archive` (the former source) was retired — it was
  never actually pushed to GitHub, only a local scratch folder.
- **Zero office-simulation coupling** since 2026-07-19 — the former
  Office/Admin UI was fully removed.

> **A note on references in this document.** Claims here point at *symbol
> names* (`copyUsageCmd()`, `parseSuggestionBlocks()`), never at line numbers.
> Line numbers were removed on 2026-07-26 because they had already rotted —
> `index.html:1480` and `index.html:2963` were both off by well over a hundred
> lines, silently, since any edit above them shifts every reference below. A
> reference that quietly becomes wrong is the exact failure mode this document
> is supposed to prevent. Symbol names survive edits and are greppable.
>
> The mechanically checkable claims below are verified on every push by
> `.github/scripts/spec-drift-check.js`. That script's registry and this file
> must be updated together.

## Verified Feature Status (comprehensive audit, 2026-07-19)

All 27 ever-requested features were checked against the actual code.
"Code-verified" means the full request/response path was read; no live
paid API calls were made.

### ✅ Fully Working (20)

| # | Feature | Evidence |
|---|---|---|
| 1 | Claude streaming AI search | `worker.js`: `stream: true`, `streamAnthropicResponse()` re-streams SSE as `{"delta"}` events; client renders via the streaming bubble path. |
| 2 | Three mutually exclusive AI modes | `AI_MODE_VALUES`; `setAiMode()` sets `AI_MODES = [mode]`; `loadAiModes()` sanitizes stored state to one valid mode. |
| 3 | Solve a Case guided controls | `#diagnose-controls`: platform/severity chips (`selectDiagnoseChip()` → `DIAGNOSE_PLATFORM/SEVERITY`) + 5 action buttons wired to `diagnoseAction()` — `start` prefills the input with chip context; next/resolved/escalate/guide call `sendAiMessage()`. |
| 4 | CLI Mode terminal-in-chat | `tryRunCliCommand()` → `CommandFlow.loadDb()/run()`; `clear`/`cls` handled; unmatched input falls through to Claude. |
| 5 | Image paste + upload + vision | Attach button `#ai-attach-btn` and document-level paste handler → `handleImageAttachment()` → `pendingImages` (base64, previews, removable) → `images` in the request body; Worker injects `type:'image'` blocks (max 3). |
| 6 | Web search tool for Claude | `worker.js`: `tools: [{type:'web_search_20260209', name:'web_search', max_uses:2}]` — yes, actually added; system prompt lists preferred official domains. `max_uses` lowered 3 → 2 on 2026-08-04: web search bills $10/1,000 searches on top of tokens, making it the largest per-request cost multiplier a caller controls. Upgraded from `web_search_20250305` on 2026-08-01 for **dynamic filtering** (Claude filters results via code execution before they reach the context window, reducing input tokens on search-heavy answers). `allowed_callers` is left at its `_20260209` default of `["code_execution_20260120"]`; `code_execution` is deliberately *not* declared separately. A newer `web_search_20260318` exists, adding only `response_inclusion` (an output-token optimisation for agents that don't echo search content back) — not adopted, since this app streams answers to a browser. |
| 11 | Hebrew default + English toggle | `LANG = localStorage.getItem('dc-lang') \|\| 'he'`; `applyLang()` flips `document.documentElement.dir` and re-renders. |
| 12 | RTL/LTR mixed rendering | `wrapLtrTerms()` intact after the Office-UI removal; applied in `renderMarkdown()` outside code spans; all modes render through it. |
| 13 | Collapsible left sidebar nav | `#tab-nav` fixed left column (200px, index.html); `toggleSidebarCollapse()` + persisted collapsed state + mobile off-canvas mode. |
| 14 | Chat as dominant UI | `init()` ends with `switchTab('ai')` — AI Search is the default tab; the chat panel fills the entire main content area beside the 200px sidebar. |
| 15 | Hover tooltips on commands | `showTooltip()` — 200ms delay, viewport-aware positioning, flag list from `data-flags`, keyboard focus support. |
| 17 | Mobile responsiveness | ≤768px: 44px touch targets (`.tab-btn/.filter-btn/.faq-pill`, `.copy-btn`), 16px inputs (iOS zoom fix), off-canvas sidebars; ≤480px adjustments. |
| 18 | FAQ pills row | `FAQ_PILLS` (7 per language) rendered into `#faq-pills`; `useFaqPill()` fills the input; auto-hidden once a conversation is active. |
| 19 | Session history sidebar | `dc-sessions` in localStorage (max 50), `renderSessionList()`, `switchSession()`, per-session mode/language, auto-summary from first user message. |
| 20 | Bookmark system | Save/Dismiss genuinely persist (`dc-bookmarks` with `dateAdded`, `dc-dismissed-bookmarks`; saved state survives re-renders). Full browse/remove UI added: `#bookmarks-btn` topbar button → `openBookmarksPanel()` opens `#bookmarks-modal` (`renderBookmarksList()`, index.html), listing domain + date per saved URL with a per-row Remove button (`removeBookmark()`) and a bilingual empty state; Escape/click-outside/close-button all dismiss, focus is managed. No new localStorage keys; client-side only, no tokens. |
| 21 | PDF export (workflows) | `generatePdf()` → `window.print()` + `@media print` isolation of `.print-target`. Workflows tab itself is now self-hosted from `data/workflows.json` + `workflows/*.md` (no external repo fetch). |
| 24 | Core knowledge modules | linux 42, cmd 25, network 30, troubleshoot 23 entries; schema + Hebrew-QA validators pass. |
| 25 | 1COM + MirtaPBX modules | Present and active (17 + 11 entries), rendered as normal tabs. Now specialty/vendor content within general-IT scope, not the defining boundary. |
| 26 | CommandFlow integration | Re-verified post-cleanup: `<script src="tools/commandflow/commandflow-core.js">`, `data/tools.json` registry, topbar link, CLI Mode path all intact. |
| 27 | Data validation scripts | `validate-json.js` (schema, bilingual pairs, approved/blocked domain enforcement) + `health-check.js` (Hebrew QA) — both pass as of this audit. |

### 🔶 Partially Built / Needs Finishing (5)

| # | Feature | What exists | What's missing |
|---|---|---|---|
| 7 | Self-education (LEARNED_SOURCE) | Worker system prompt (worker.js) instructs Claude to append a plain-text `LEARNED_SOURCE: {...}` line after `---` for good web-search sources, restricted to approved domains. **Client-side parsing now exists** (TODO-001, merge `d37943d`, 2026-07-24): `parseSuggestionBlocks()` strips the block out of the rendered body and `renderSuggestionCards()` renders it as a dismissible card with a "File this" action. | The "File this" action only copies the JSON to the clipboard — no GitHub Issue is created and nothing is written to `flagged/pending-review.md`. The filing half remains blocked on the GitHub write-credential decision in `NEEDS_YOUR_REVIEW.md`. |
| 8 | Very-high source scrutiny | Approved/blocked domain allowlists enforced in code (`validate-json.js:18-85`, runs in CI on every push); `flagged/` pending→approved/rejected files exist; worker prompt instructs verification caution. | The quarantine flow is a documented **manual process** — `flagged/pending-review.md` is an empty table, and nothing automatically routes AI-suggested URLs into it. |
| 9 | Auto-update KB via GitHub Issue | Prompt-side plus client-side rendering: `CAPABILITY_SUGGESTION` blocks are parsed and shown as cards (see #7). | No code path creates an Issue anywhere in this repo. Blocked on the same GitHub write-credential decision. |
| 10 | Self-extending capability | `CAPABILITY_SUGGESTION: {...}` block spec in the system prompt, now detected and surfaced in the UI (see #7). | No Issue filing, so a suggestion still requires the owner to act on it manually. Aspirational beyond surfacing. |
| 16 | Expandable cards + copy buttons | Expand/collapse fully works (`toggleCard()`, `aria-expanded`, keyboard support via `handleExpandKeydown`). Copy-to-clipboard now exists on both AI-chat code blocks (`copyAiCode()`) **and** command-card `usage-cmd` rows (`copyUsageCmd()`, index.html + 2684) — shipped by TODO-003, merge `b3451b1`, 2026-07-20. | Nothing outstanding — this row is retained for audit-trail continuity and should move to "Fully Working" at the next full re-audit. |

### ❌ Requested But Never Built (2)

| # | Feature | Evidence |
|---|---|---|
| 22 | Presentation/slide generation | Zero matches for presentation/slide/pptx/jsPDF repo-wide. Candidate for future work, not a phantom regression. |
| 23 | Workflow document *generation* | Definitive: workflow *viewing* works (fetch + render from this repo's own `workflows/` folder), but nothing generates workflow documents — they are authored manually. |

## File Structure (post-cleanup)

```
data-center/
├── index.html              # entire app (~3,440 lines)
├── data/
│   ├── modules.json        # 13 modules: 6 active, 7 coming-soon
│   ├── linux.json          # 42 entries
│   ├── cmd.json            # 25 entries
│   ├── network.json        # 30 entries
│   ├── 1com.json           # 17 entries
│   ├── mirtapbx.json       # 11 entries
│   ├── troubleshoot.json   # 23 scenarios
│   ├── tools.json          # 1 tool (CommandFlow)
│   ├── workflows.json      # 3 workflow guides (self-hosted, Workflows tab)
│   └── notebooks/          # Notebook-X mirror: index + 12 notebooks (weekly sync)
├── workflows/              # workflow markdown files (linux/, networking/)
├── tools/commandflow/      # standalone simulator + shared CLI engine
├── cloudflare-worker/      # worker.js, wrangler.toml, README.md (deploy guide)
├── flagged/                # source flagging system
├── .github/scripts/        # validate-json.js, health-check.js, check-links.js, sync-notebooks.js
├── .github/workflows/      # validate, health, link-check, monthly-review, notebook-sync, changelog
├── CLAUDE.md               # rules & standards
├── CURRENT-SPEC.md         # this file
├── TOKEN-BUDGET.md         # session history log
├── CHANGELOG.md            # auto-generated
└── README.md               # public landing page
```

Active modules: `linux`, `cmd`, `network`, `1com`, `mirtapbx`,
`troubleshoot`. Coming-soon: `powershell`, `cloud`, `security`, `docker`,
`cicd`, `casestudies`, `cli`.

## Data Schema

Full field-by-field schemas live in `CLAUDE.md` ("Bilingual Schema").
Summary: every entry is bilingual (`*_he` / `*_en` pairs that must
differ), commands/flags are Hebrew-free LTR, `source_url` must be on the
approved-domain allowlist and pass the `flagged/` review flow. New modules
are registered in `data/modules.json` (data-driven tabs — no code change
needed) and validated by `.github/scripts/validate-json.js`.

## Known Issues / Open Items

- The partially-built AI self-improvement items (#7-#10 above) now share a
  narrower root gap: as of TODO-001 (2026-07-24) the suggestion blocks ARE
  parsed client-side and rendered as dismissible cards, so they no longer
  leak as plain text into answers. What is still missing is the filing half
  — nothing writes to `flagged/pending-review.md` or opens an Issue — which
  stays blocked on the GitHub write-credential decision in
  `automation/NEEDS_YOUR_REVIEW.md`.
- (Resolved 2026-07-20: command-card usage rows now have copy buttons —
  TODO-003. Saved-bookmarks browsing UI, formerly #20 here, also shipped —
  see Recently Completed.)
- No functional bugs currently flagged. (The 2026-07-19 audit's three
  open items — Office/Admin UI, `notebooks/`, `data/resources and
  links.txt` — were all removed per owner decision on the same date.)

## Recently Completed

- **Notebook-X integration: repo mirror + client-side selection (2026-07-21)**:
  resolves the architecture decision in `automation/NEEDS_YOUR_REVIEW.md`.
  `.github/workflows/notebook-sync.yml` + `.github/scripts/sync-notebooks.js`
  mirror the Notebook-X index + all 12 notebooks into `data/notebooks/`
  weekly via a read-only fine-grained PAT (`NOTEBOOKX_READ_TOKEN` secret).
  `index.html` adds `matchNotebooks()` (word-boundary + stopword-filtered
  scoring against name/domain/tags/summary) and `buildNotebookContext()`
  (fetches up to 2 matches, selects matching sections, caps at ~15 KB,
  truncates at section boundaries), wired into `sendAiMessage()` as a new
  `notebook_context` request field. `worker.js`'s old `getNotebookXContext()`
  (confirmed silent no-op) is deleted — the Worker now just appends the
  client-built context to the system prompt with a 20 KB server-side cap,
  no fetching/KV/credentials of its own. Verified against the real mirrored
  data via a Node harness reproducing the exact browser code path (Chrome
  browser automation was unavailable this session).
- **Workflows tab made self-hosted (2026-07-20)**: `data-center-archive` was
  confirmed retired — it was never pushed to GitHub, only a local scratch
  folder existed. Its 3 real workflow markdown files were migrated into this
  repo's own `workflows/` folder; the tab now reads a `data/workflows.json`
  registry (loaded into `DB.workflows`) instead of a hardcoded `WORKFLOWS`
  array, and `openWorkflow()` fetches same-origin instead of
  `raw.githubusercontent.com`. The old "archive not connected" fallback is
  gone (structurally unreachable now); an empty-`data/workflows.json` state
  shows a bilingual empty-state message instead.
- **My Bookmarks browsing/management panel** (TODO-004, merge commit
  `ab196ac2`): `#bookmarks-btn` topbar button opens a modal
  (`openBookmarksPanel()`/`renderBookmarksList()`/`removeBookmark()`,
  index.html) listing saved bookmarks with per-row Remove and a
  bilingual empty state — closes the gap noted in feature #20 above. Built
  and merged by the twice-daily unattended Builder/Auditor automation
  (`automation/DATA_CENTER_AUTOMATION_SPEC.md`), the first item it fully
  closed out end-to-end.
- **2026-07 (commit `f64eb30`)**: Worker upgraded to `claude-sonnet-5`;
  Hebrew/English RTL rendering fixed via `wrapLtrTerms()`; IT scope
  expanded beyond Netvill to general IT.
- **Notebook-X index injection** (commit `455a087`, superseded 2026-07-21):
  the original `getNotebookXContext()` listed available notebooks in the
  system prompt, but was a confirmed silent no-op in production (unauthenticated
  fetch against the private repo, always 404ing). Replaced by the repo-mirror
  design above — see that entry.
- **Usage logging** (commit `39e70f7`): request logging on
  `data-center-api` for spike visibility.
- **Audit & cleanup (2026-07-19, commits `d5331cd` + `153152f`)**:
  repo-wide audit; `CLAUDE.md` rewritten; `ROADMAP.md` folded in and
  removed; `README.md` refreshed; all office-simulation leftovers deleted
  (`tools/runbook/`, then per owner decision the in-app Office/Admin UI
  (~660 lines), `notebooks/`, and `data/resources and links.txt`) — zero
  office coupling remains. Followed by this comprehensive 27-item
  feature audit.

## Future Vision (Not Started)

**Notebook-X integration** is now implemented (repo mirror + client-side
section matching — see Recently Completed above); this unblocks, but does
not itself lift, the TODO-005–011 content-module pause (owner decision,
tracked in `automation/NEEDS_YOUR_REVIEW.md`). Content-module roadmap (from
the retired ROADMAP.md): activate the `powershell`, `cloud`, `security`,
`docker`, `cicd`, `casestudies`, and `cli` modules as content is authored;
longer-term ideas (PWA/offline, contribution guide) remain unscheduled.
Natural next steps surfaced by
this audit: a client-side parser + Issue-filing flow for the
`CAPABILITY_SUGGESTION`/`LEARNED_SOURCE` blocks, and copy buttons on
command cards (the saved-bookmarks browsing panel also on this list has
since shipped — see Recently Completed).
