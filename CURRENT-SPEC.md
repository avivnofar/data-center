# Data Center — Current Technical Specification

*Audited 2026-07-19. Source of truth for architecture and feature status.
Rules and standards live in `CLAUDE.md`; this file records what actually
exists and works today.*

## Scope

General IT support knowledge base and AI assistant for IT professionals
(sysadmins, DevOps, helpdesk, students), bilingual Hebrew/English with
Hebrew-first RTL. Expanding toward cybersecurity content (a `security`
module is registered `coming-soon`). Vendor PBX modules (1COM, MirtaPBX)
remain as ordinary content modules — the project is not scoped to any one
company. AI backend model: **`claude-sonnet-5`**.

## Architecture

- **Frontend**: `index.html` (~4,100 lines) — entire app in one file, no
  build step, no dependencies. Tabs are data-driven from
  `data/modules.json`; `init()` loads all data files via
  `Promise.all(fetch(...))`.
- **AI backend**: `cloudflare-worker/worker.js` (~500 lines) — the
  `data-center-api` Cloudflare Worker, a secure proxy holding the
  Anthropic API key as a Worker secret. Streams responses, enforces an
  origin allowlist and 20 req/min/IP rate limit, and includes the
  `web_search` tool (max 3 uses per request).
- **AI Search flow**: the app builds a small `db_context` from locally
  matched knowledge-base entries, sends
  `{messages, mode, language, db_context, cli_mode, images}` to
  `/api/chat`; the Worker assembles a bilingual system prompt (plus a
  live-fetched Notebook-X notebook index) and calls Claude.
- **Three AI modes** — strict radio, exactly one active
  (`AI_MODE_VALUES = ['search', 'diagnose', 'cli']`, stored in
  `localStorage` `dc-modes`): Free Search, Solve a Case (platform/severity
  chips + start/next/resolved/escalate/guide actions), and CLI Mode.
- **CLI Mode / CommandFlow**: `tools/commandflow/` — standalone "Terminal
  Academy" simulator (registered in `data/tools.json`, linked from the
  topbar) whose engine (`commandflow-core.js` + `commands.json`, 7
  platforms) also powers in-app CLI Mode: recognized commands render
  instantly client-side at zero API cost; unmatched input falls through to
  Claude.
- **Workflows tab**: renders bilingual workflow markdown fetched from the
  sibling `data-center-archive` repo (raw.githubusercontent.com), with a
  graceful "archive not connected" fallback and print-based PDF export.

## Verified Feature Status (audited 2026-07-19)

| Feature | Status | Evidence |
|---|---|---|
| Image/screenshot analysis | **Fully working** (code-verified) | UI: attach button `#ai-attach-btn` + document-level paste handler → `handleImageAttachment()` → `pendingImages` (base64 + media_type, previews, removable). Sent as `images` in the `/api/chat` body. Worker: validates array, slices to max 3, injects `type:'image'` base64 content blocks into the last user message; system prompt tells Claude it can analyze screenshots. |
| PDF export (workflows) | **Fully working** | `generatePdf()` → `window.print()` with `@media print` isolation of `.print-target`. Print-based only — no jsPDF/library. |
| Presentation/slide generation | **Not implemented** | Zero matches for presentation/slide/pptx/jsPDF anywhere in the repo. Never built. |
| Workflow document *viewing* | **Fully working** | `WORKFLOWS` array + `openWorkflow()` fetch from `data-center-archive` with bilingual fallback message. |
| Workflow document *generation* | **Not implemented** | No code generates workflow docs; they are authored manually in the archive repo. |
| Terminal/CLI Mode (CommandFlow) | **Fully working** | `tools/commandflow/` intact; registered in `data/tools.json`; in-app `tryRunCliCommand()` → `CommandFlow.loadDb()/run()`; `clear`/`cls` handled; fall-through to Claude on unmatched input. |
| Three AI modes (Free Search / Solve a Case / CLI) | **Fully working** | `role="radiogroup"` with three `role="radio"` buttons; `setAiMode()` enforces `AI_MODES = [mode]` (exactly one); `loadAiModes()` sanitizes stored state to a single valid mode, defaulting to `search`. |
| Hebrew/English RTL rendering | **Fully working** | `wrapLtrTerms()` (index.html:2486) wraps URLs/IPs/paths/flags — plus versions and English words in Hebrew flow — in `dir="ltr"` isolated spans; applied inside `renderMarkdown()` on non-code segments. All modes (streaming finalize, history replay, CLI output) render through `renderMarkdown()`. |
| Web search in AI answers | **Fully working** (code-verified) | Worker request includes `web_search_20250305` tool, max 3 uses; system prompt instructs citing sources. |
| Notebook-X context injection | **Working (phase 1 only)** | `getNotebookXContext()` fetches the public notebook index and appends it to the system prompt; silent no-op on failure. Content-level retrieval not built. |
| Bookmark bars on AI answers | **Present** | `renderBookmarkBars()` wired into bubble finalize/append; localStorage-persisted. |
| Office/Admin tab | **Removed (2026-07-19)** | All Office/Admin UI stripped from `index.html` per owner decision — zero coupling to the external `office-AI-agents` project remains. |

"Code-verified" = verified by reading the full request/response path in
code; no live paid API call was made during this audit.

## File Structure (post-cleanup)

```
data-center/
├── index.html
├── data/
│   ├── modules.json        # 13 modules: 6 active, 7 coming-soon
│   ├── linux.json          # 42 entries
│   ├── cmd.json            # 25 entries
│   ├── network.json        # 30 entries
│   ├── 1com.json           # 17 entries
│   ├── mirtapbx.json       # 11 entries
│   ├── troubleshoot.json   # 23 scenarios
│   └── tools.json          # 1 tool (CommandFlow)
├── tools/commandflow/      # standalone simulator + shared CLI engine
├── cloudflare-worker/      # worker.js, wrangler.toml, README.md (deploy guide)
├── flagged/                # source flagging system
├── .github/scripts/        # validate-json.js, health-check.js, check-links.js
├── .github/workflows/      # validate, health, link-check, monthly-review, changelog
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

- None currently flagged. (The 2026-07-19 audit's three open items —
  Office/Admin UI in `index.html`, the untracked `notebooks/` staging
  folder, and `data/resources and links.txt` — were all removed per owner
  decision on the same date.)

## Recently Completed

- **2026-07 (commit `f64eb30`)**: Worker upgraded to `claude-sonnet-5`;
  Hebrew/English RTL rendering fixed via `wrapLtrTerms()`; IT scope
  expanded beyond Netvill to general IT.
- **Notebook-X index injection** (commit `455a087`): Worker system prompt
  now lists available Notebook-X notebooks at request time.
- **Usage logging** (commit `39e70f7`): request logging on
  `data-center-api` for spike visibility.
- **Office simulation fully migrated out** (commits `deec66c`, `ebfc858`,
  and this audit): `agents/` removed earlier; this audit removed the last
  leftovers (`tools/runbook/` — three unwired demo-component ports) and
  rewrote `CLAUDE.md` without simulation content.
- **This audit (2026-07-19)**: repo-wide feature verification (table
  above), `CLAUDE.md` rewrite, `CURRENT-SPEC.md` created, `ROADMAP.md`
  folded in and removed, `README.md` refreshed. Per owner decision, all
  Office/Admin UI was then stripped from `index.html` (~660 lines: locked
  tab, lock modal, admin dashboard, `CONFIG.AGENTS_API_BASE`), and
  `notebooks/` + `data/resources and links.txt` were deleted — the repo
  now has zero coupling to the office simulation.

## Future Vision (Not Started)

**Notebook-X integration** — enrich AI Search answers with Notebook-X's
in-depth knowledge notebooks. Only phase 1 (index injection into the
system prompt) exists; retrieving actual notebook content into answers is
planned but not started, and should not be built until the core app is
stable. Content-module roadmap (from the retired ROADMAP.md): activate the
`powershell`, `cloud`, `security`, `docker`, `cicd`, `casestudies`, and
`cli` modules as content is authored; longer-term ideas (PWA/offline,
contribution guide) remain unscheduled.
