# CLAUDE.md — Data Center IT Knowledge Base
## Project Bible (Bilingual Edition)

---

## Project Overview

**Data Center** is a static single-page bilingual (Hebrew/English) IT troubleshooting reference built for sysadmins, DevOps engineers, and IT students. It delivers searchable command cards, hover tooltips, and step-by-step troubleshoot scenarios — all as a zero-dependency static HTML file deployable to any static host.

**Live site:** [avivnofar.github.io/data-center](https://avivnofar.github.io/data-center)

**Hebrew default:** The UI defaults to Hebrew with RTL layout. Language is toggled via a button and stored in `localStorage` key `dc-lang`.

---

## Current Strategy (authoritative)

This section reflects the project owner's current direction and supersedes
any conflicting framing elsewhere in this file or in `agents/README.md` /
`agents/AGENTS.md`. Nothing described here requires deleting existing work.

- **One Gemini engine, not eleven Workers.** The AI Agent Simulation's end
  goal — a full 1-year office simulation with all 11 agent personalities
  (per the project's spec document) — remains the goal. The infrastructure
  choice is a single Gemini-backed Cloudflare Worker (`agent-runner.js` /
  `data-center-agents`) that role-plays all 11 personas by reading
  `agents/config/agents-config.json`, rather than 11 independent
  Workers/Durable Objects running in parallel.
- **Existing simulation work is the data layer, not dead code.** The
  simulation runtime, `agents-config.json`, `simulation-config.json`, the
  year-tracker config, side-plot narrative config, and promotion/PIP track
  config all stay as-is — they are the spec the single engine reads from
  and acts on.
- **UI polish is the immediate priority.** Before running the full-year
  simulation, focus on making `index.html` excellent and scalable for heavy
  use: a working Claude AI Search end-to-end, fast, mobile-ready,
  Hebrew/English. See `TOKEN-BUDGET.md` for the session queue.
- **Findings flow back via GitHub Issues.** Once the UI is solid, the
  single Gemini agent exercises the live app like a real user and reports
  findings via Issues (the Gemini-Claude bridge, `claude-action` label) to
  improve the app and database.
- See `agents/STRATEGY.md` for the agents/-folder-specific version of this.

---

## Folder Structure

```
data-center/
├── index.html                   # Entire app — HTML + CSS + JS in one file
├── data/
│   ├── modules.json             # Tab registry — source of truth for all modules
│   ├── linux.json               # Linux commands (24 entries)
│   ├── cmd.json                 # Windows CMD commands (13 entries)
│   ├── network.json             # Cross-platform network tools (10 entries)
│   └── troubleshoot.json        # Step-by-step troubleshoot scenarios (9 entries)
├── flagged/                      # Source flagging system (see Rules section)
│   ├── README.md                # How the pending → approved/rejected flow works
│   ├── pending-review.md        # Candidate source URLs awaiting review
│   ├── approved-sources.md      # Specific URLs verified and in use
│   └── rejected-sources.md      # URLs rejected, with reason
├── .github/
│   ├── scripts/
│   │   ├── validate-json.js     # Schema + bilingual field validator
│   │   ├── health-check.js      # Weekly quality checks with Hebrew QA
│   │   └── check-links.js       # Daily source_url reachability check
│   └── workflows/
│       ├── validate.yml         # Runs on every push/PR
│       ├── changelog.yml        # Auto-generates CHANGELOG.md
│       ├── health.yml           # Weekly Monday 08:00 UTC + manual trigger
│       ├── link-check.yml       # Daily 06:00 UTC — checks source_url links
│       ├── monthly-review.yml   # Monthly 1st @ 08:00 UTC — flags pending sources
│       ├── agent-cases.yml      # Weekly Monday 09:00 UTC — generates agent simulation case batch
│       └── agent-reports.yml    # Weekly Tuesday 08:00 UTC — agent simulation weekly report
├── cloudflare-worker/            # AI Search backend (Cloudflare Worker, Claude API)
├── agents/                       # AI Agent Simulation (DRAFT, Phase 1) — see agents/README.md
│   ├── config/                   # simulation-config.json, agents-config.json
│   ├── workers/                  # agent-runner.js, scheduler.js, case-generator.js, gemini-client.js, state-manager.js
│   ├── agents/                   # agent-base.js + per-agent classes (agent-1..4-*.js, agent-stub.js)
│   ├── dashboard/                # standalone admin dashboard (admin-panel.html, dashboard.js)
│   ├── reports/templates/        # incident/status/weekly report markdown templates
│   ├── database/                 # D1 schema.sql + seed-cases.sql
│   ├── README.md                 # setup, architecture, env vars
│   └── AGENTS.md                 # agent specification reference (summary, not final)
├── .nojekyll                    # Prevents GitHub Pages Jekyll processing
├── CLAUDE.md                    # This file
├── ROADMAP.md                   # Phase milestones
├── CHANGELOG.md                 # Auto-generated
└── .gitignore
```

**Sibling repo:** [`data-center-archive`](https://github.com/avivnofar/data-center-archive) holds longer-form
bilingual workflow documents (rendered in the in-app "Workflows" tab) and
generated PDFs. See [Workflows Archive](#workflows-archive-data-center-archive) below.

---

## Running Locally

`init()` uses `fetch()` — opening as `file://` fails with CORS. Use:

```bash
python -m http.server 8080
# open http://localhost:8080
```

Or: `npx serve .`

---

## Bilingual Schema

All JSON files use a bilingual field naming convention:
- `field_he` — Hebrew content
- `field_en` — English content

The `t(entry, 'field')` helper in `index.html` returns the correct language based on `LANG`.

### `data/linux.json`, `data/cmd.json`, `data/network.json`

```jsonc
{
  "id":         string,    // REQUIRED. Unique slug, kebab-case (e.g. "netstat")
  "name":       string,    // REQUIRED. Display name in card header
  "cat":        string,    // REQUIRED. Category — see allowed values per file
  "diff":       string,    // REQUIRED. "beginner" | "intermediate" | "advanced"
  "sec":        boolean,   // REQUIRED. true if security note should be shown
  "desc_he":    string,    // REQUIRED. Hebrew description (one sentence)
  "desc_en":    string,    // REQUIRED. English description (must differ from desc_he)
  "source_url": string,    // REQUIRED. Official docs URL (approved domains only)
  "source_name":string,    // REQUIRED. Human-readable source name
  "usage": [
    {
      "cmd":    string,    // REQUIRED. The shell command — NO Hebrew characters
      "cmt_he": string,    // REQUIRED. Hebrew explanation
      "cmt_en": string     // REQUIRED. English explanation
    }
  ],
  "quick_flags": [         // OPTIONAL. Array of flag reference entries
    {
      "flag":   string,    // REQUIRED. The flag (e.g. "-n") — NO Hebrew
      "desc_he":string,    // REQUIRED. Hebrew description
      "desc_en":string     // REQUIRED. English description
    }
  ],
  "scenarios_he": [string], // REQUIRED. 2-4 Hebrew bullet points: when to use
  "scenarios_en": [string], // REQUIRED. 2-4 English bullet points: when to use
  "mistakes": [
    {
      "x_he":   string,   // REQUIRED. Hebrew — what the mistake is
      "x_en":   string,   // REQUIRED. English — what the mistake is
      "fix_he": string,   // REQUIRED. Hebrew fix (may contain inline HTML)
      "fix_en": string    // REQUIRED. English fix (may contain inline HTML)
    }
  ],
  "secnote_he": string,    // OPTIONAL. Hebrew security note (inline HTML ok)
  "secnote_en": string,    // OPTIONAL. English security note (inline HTML ok)
  "tags":       string     // REQUIRED. Space-separated search keywords
}
```

#### Allowed `cat` values

| File | Valid categories |
|------|-----------------|
| `linux.json` | `network`, `process`, `disk`, `permission`, `system`, `logs`, `user` |
| `cmd.json` | `network`, `process`, `disk`, `system`, `user` |
| `network.json` | `diagnostic`, `ports`, `routing`, `dns`, `firewall` |

### `data/troubleshoot.json`

```jsonc
{
  "id":          string,  // REQUIRED. Must start with "ts-"
  "title_he":    string,  // REQUIRED. Hebrew scenario title
  "title_en":    string,  // REQUIRED. English scenario title
  "plat":        string,  // REQUIRED. "linux" | "windows" | "network" | "cross-platform"
  "severity":    string,  // REQUIRED. "critical" | "high" | "medium" | "low"
  "desc_he":     string,  // REQUIRED. Hebrew failure mode description
  "desc_en":     string,  // REQUIRED. English failure mode description
  "steps": [
    {
      "n":       number,  // REQUIRED. Step number (1-based)
      "text_he": string,  // REQUIRED. Hebrew step description
      "text_en": string,  // REQUIRED. English step description
      "cmd":     string,  // REQUIRED. The command to run — NO Hebrew
      "note_he": string,  // REQUIRED. Hebrew explanation of expected output
      "note_en": string   // REQUIRED. English explanation of expected output
    }
  ]
}
```

### `data/modules.json`

```jsonc
{
  "id":            string,          // REQUIRED. Module slug (matches DB key)
  "label_he":      string,          // REQUIRED. Hebrew tab label
  "label_en":      string,          // REQUIRED. English tab label
  "icon":          string,          // OPTIONAL. Emoji icon for tab
  "data_file":     string,          // REQUIRED. Path to data file
  "status":        string,          // REQUIRED. "active" | "coming-soon"
  "filter_type":   string,          // REQUIRED. "command" | "troubleshoot"
  "categories_he": object,          // OPTIONAL. Map of category_key -> Hebrew label
  "categories":    [string]         // REQUIRED. List of valid category keys
}
```

---

## Rules for Adding New Content

1. **Unique IDs** — every entry across all four files must have a unique `id`. Use kebab-case. Troubleshoot IDs must start with `ts-`.

2. **No Hebrew in `cmd` fields** — all shell commands are LTR. The validator rejects Hebrew characters in `cmd`, `quick_flags[].flag`, and `steps[].cmd`.

3. **Bilingual pairs must differ** — `desc_he` must not be identical to `desc_en`. The validator will catch copy-pasted fields.

4. **Hebrew writing style** — natural professional Hebrew. Wrap English technical terms inline with `<span class="ltr-term">term</span>`. Example:
   ```
   "desc_he": "מציגה את ה-<span class=\"ltr-term\">listening sockets</span> עם ה-PID שלהם"
   ```

5. **Code blocks always LTR** — all `<code>` and `<pre>` blocks have `dir="ltr"` attribute. CSS also enforces `direction:ltr; unicode-bidi:isolate`.

6. **Inline HTML in `fix_he/fix_en` and `secnote_he/en`** — these fields render via `innerHTML`. Allowed: `<span class="ltr-term">`, `<b>`, `<code>`. No block elements.

7. **Approved `source_url` domains only:**
   - `man7.org`, `linux.die.net`, `learn.microsoft.com`, `docs.microsoft.com`
   - `ss64.com`, `linux.org`, `kernel.org`, `iana.org`, `rfc-editor.org`
   - `nmap.org`, `wireshark.org`, `ubuntu.com`, `redhat.com`, `debian.org`
   - `cloudflare.com`, `cisco.com`, `tcpdump.org`, `iperf.fr`, `software.es.net`

8. **Blocked domains** (validator will reject):
   `stackoverflow.com`, `reddit.com`, `medium.com`, `youtube.com`, `github.com`, `geeksforgeeks.org`, `w3schools.com`, `*.blogspot.com`

9. **Security notes only when dual-use** — set `"sec": true` and populate `secnote_he/en` only for meaningfully dual-use commands.

10. **Validate before pushing:**
    ```bash
    node .github/scripts/validate-json.js
    node .github/scripts/health-check.js
    ```

11. **No build step** — do not introduce a bundler, transpiler, or package.json unless adding a build pipeline.

---

## Architecture Notes

- `DB` is a module-level object populated by `async function init()` via `Promise.all(fetch(...))`.
- Tab system is fully data-driven from `modules.json` — zero hardcoded tabs in `index.html`.
- `t(obj, key)` returns `obj.key_he` or `obj.key_en` based on `LANG` global.
- `tArr(obj, key)` same for array fields (`scenarios_he/en`).
- `renderCard()` and `renderTsCard()` generate HTML strings and set `innerHTML`. All user strings pass through `escHtml()` before insertion.
- Hover tooltip: 200ms delay, viewport-aware position calculation, hides on mouseleave.
- Language toggle: sets `LANG`, saves to `localStorage`, calls `applyLang()` + re-renders active tab.

---

## Workflows Archive (`data-center-archive`)

The **Workflows** tab (`📋`, `dataset.moduleId = 'workflows'`, built by
`buildWorkflowsTabBtn()` / `buildWorkflowsPanelShell()` / `renderWorkflowsPanel()`
in `index.html`) renders longer-form bilingual step-by-step workflow documents
that don't fit the command-card schema.

- Workflow metadata lives in the `WORKFLOWS` array in `index.html` (id, bilingual
  title/desc, `path`, `updated`).
- `ARCHIVE_RAW_BASE` points at `raw.githubusercontent.com/avivnofar/data-center-archive/master/`;
  `openWorkflow(id)` fetches `ARCHIVE_RAW_BASE + wf.path` and renders the markdown
  via `renderMarkdown()` (which supports headings, lists, code blocks, and pipe-tables).
- **Graceful fallback**: if the fetch fails (repo not yet pushed, 404, CORS), the
  panel shows a bilingual "archive not connected yet" message linking to
  `ARCHIVE_REPO_BASE + wf.path` on GitHub instead of erroring.
- The archive repo structure: `workflows/<platform>/*.md` (the docs themselves and
  `templates/` for new docs), `pdfs/` (generated PDFs, see below), `flagged/`
  (mirrors this repo's approved/blocked domain rules), `guides/` and `raw/`
  (placeholders for future short-form content).

**Keep the archive lean** — per explicit project direction, do **not** build a
large "raw materials" research database there. Only workflow markdown files and
generated PDFs belong in `data-center-archive`. Anything else worth remembering
(reference links, research notes, source candidates) belongs in Claude's own
persistent memory, not in repo files. See [Autonomous Brain Rules](#autonomous-brain-rules).

---

## PDF Export (Print-Based)

Workflow pages can be exported to PDF via the **"📄 Generate PDF"** floating
action button (`#pdf-fab`, shown/hidden by `showPdfFab()`/`hidePdfFab()`).

- `generatePdf()` simply calls `window.print()` — **no bundler, server, or
  headless-browser dependency** (consistent with the "no build step" rule).
- The active workflow's content container gets a `.print-target` class.
- A `@media print` CSS block hides everything except `.print-target`
  (topbar, tab nav, search, AI banner, workflow list, FAB, back button are all
  force-hidden), forces white background / black text, and keeps `<pre>`/`<code>`
  blocks LTR even when the page is RTL.
- Resulting PDFs are expected to be saved into `data-center-archive/pdfs/`
  (manually, or via future automation) — see that repo's `pdfs/TABLE_OF_CONTENTS.md`.

---

## Bookmark System

In AI chat responses, any URL Claude mentions gets a small "bookmark bar"
(`renderBookmarkBars()`, called from `finalizeStreamingBubble()` and
`appendMessageBubble()`) with **Save** / **Dismiss** actions.

- Saved URLs persist to `localStorage` key `dc-bookmarks`; dismissed ones to
  `dc-dismissed-bookmarks`. Both read/written via `getSavedBookmarks()` /
  `getDismissedBookmarks()`.
- **Client-side only, no credentials** — this intentionally replaces an earlier
  design that would have committed bookmarks to GitHub via a client-embedded
  write token. Never reintroduce a design that ships write credentials to the
  browser; if "save to archive" is wanted later, it must go through a
  server-side component (e.g. the Cloudflare Worker) that holds the token.

---

## Source Flagging System

`flagged/` tracks candidate documentation sources before they become a
`source_url`: `pending-review.md` → `approved-sources.md` or
`rejected-sources.md`. See `flagged/README.md` for the workflow. The
canonical approved/blocked **domain** lists remain Rules 7-8 below — `flagged/`
tracks specific **URLs**, not domains, and is not a duplicate of those rules.

---

## AI Agent Simulation (`agents/`)

`agents/` scaffolds a simulated "AI agent team" that uses the live app
(via `data-center-api`'s `/api/chat`) like real sysadmins, role-played by
Gemini 2.0 Flash. **Status: DRAFT (Phase 1 foundation)** — agents 1-4
("The Perfectionist", "The Productive", "The Standard Agent", "The Trainee")
have full mood/irritation/panic state machines; agents 5-11 are placeholder
stubs (`agent-stub.js`) pending a finalized spec. See `agents/README.md`
(architecture, setup, env vars) and `agents/AGENTS.md` (per-agent behavior
summary).

- **Workers**: `agent-runner.js` (admin HTTP API + agent execution) and
  `scheduler.js` (cron-driven hourly "work day" / daily "work week" cycles)
  are Cloudflare Workers backed by D1 (`agents/database/schema.sql`),
  Durable Objects (`state-manager.js`), and KV (`SIM_KV` for live
  `inspection_mode`/`paused`/`phase` overrides). None of this is deployed by
  this commit — see `agents/README.md`'s manual setup steps.
- **Admin tab**: the in-app 🔐 Admin tab (`dataset.moduleId = 'admin'`,
  `buildAdminTabBtn()`/`buildAdminPanelShell()`/`renderAdminPanel()` in
  `index.html`) is a read-only-by-default dashboard (agent status grid, live
  session feed, reports/suggestions, simulation controls, performance
  metrics). A standalone equivalent lives at `agents/dashboard/admin-panel.html`.
- **Admin auth**: the dashboard never ships a real secret. The admin types a
  token into the page once (stored in `localStorage` as `dc-admin-token`,
  sent as the `X-Admin-Token` header); `agent-runner.js` and `scheduler.js`
  validate it server-side against `env.ADMIN_TOKEN` (a Worker secret). This
  is the same pattern required by the credential rules below — never embed
  `ADMIN_TOKEN` (or `GEMINI_API_KEY`/`GITHUB_TOKEN`) in `index.html` or
  `dashboard.js`.
- **CI**: `agent-cases.yml` and `agent-reports.yml` (see Automation
  Workflows below) keep the simulation's case pool and weekly reports
  flowing once the Workers are deployed.

---

## Automation Workflows

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `validate.yml` | every push/PR | Schema + bilingual field validation (`validate-json.js`) |
| `link-check.yml` | daily 06:00 UTC | Checks every `source_url` is reachable (`check-links.js`); opens/closes a `broken-link` issue |
| `health.yml` | weekly, Mon 08:00 UTC | Data quality + Hebrew QA (`health-check.js`); opens a `data-quality` issue on critical failure |
| `monthly-review.yml` | monthly, 1st @ 08:00 UTC | Opens a `source-review` issue if `flagged/pending-review.md` has unreviewed entries |
| `changelog.yml` | on push to master | Auto-generates `CHANGELOG.md` |
| `agent-cases.yml` | weekly, Mon 09:00 UTC | Generates the AI Agent Simulation's weekly case batch (`generate-agent-cases.mjs`) and commits `agents/database/cases-*.json` |
| `agent-reports.yml` | weekly, Tue 08:00 UTC | Triggers the simulation's weekly reset cycle and commits a generated report to `agents/reports/`; opens an `agent-incident` issue on critical incidents. No-ops until `AGENTS_API_BASE`/`AGENTS_SCHEDULER_BASE` repo variables and `ADMIN_TOKEN` secret are configured (see `agents/README.md`) |

All scheduled workflows also support `workflow_dispatch` for manual runs.
`validate.yml`, `link-check.yml`, `health.yml`, `monthly-review.yml`, and
`changelog.yml` require no secrets beyond the default `GITHUB_TOKEN`.
`agent-cases.yml` likewise needs nothing extra. `agent-reports.yml` requires
the agent-simulation variables/secrets above.

---

## ⚠️ Hebrew Session Reminder

When adding new entries in a Claude Code session:
1. Run `node .github/scripts/health-check.js` before committing
2. Verify `desc_he` is in Hebrew (not English copy-pasted)
3. Verify all `cmd` fields have no Hebrew characters
4. Wrap English technical terms in `<span class="ltr-term">` in Hebrew text
5. `desc_he` and `desc_en` must be meaningfully different translations

---

## Autonomous Brain Rules

When operating autonomously across sessions on this project:

1. **Memory over files for research** — when you learn reference information
   (useful links, domain notes, command details, prior decisions) that isn't a
   finished workflow doc, save it to Claude's persistent memory
   (`~/.claude/projects/.../memory/`), not as new files in this repo or in
   `data-center-archive`. Search the internet in real time for current
   information rather than stockpiling raw copies.
2. **Keep both repos lean** — `data-center-archive` holds only workflow `.md`
   files and generated PDFs. This repo holds the app, data, automation, and
   `flagged/` tracking files. Resist creating "just in case" reference dumps.
3. **Security first** — never design a feature that ships write credentials
   (GitHub tokens, API keys) to the browser. Client-side persistence
   (`localStorage`) is fine for user-local state (bookmarks, sessions,
   language); anything that needs to write to GitHub or call paid APIs goes
   through the Cloudflare Worker.
4. **No build step, ever** — solve new requirements (PDF export, etc.) within
   the static-HTML-plus-`fetch()` architecture. If a requirement seems to need
   a bundler/server, find the static-web-platform equivalent first.
5. **Validate before committing** — always run `validate-json.js` and
   `health-check.js` after touching `data/*.json`, and sanity-check
   `index.html` loads (`python -m http.server 8080`) after JS/CSS edits.
6. **Pause before pushing to `master`** — after committing locally, summarize
   what changed and what automation/workflows it affects, and wait for
   explicit confirmation before `git push`.
7. **Don't delete without instruction** — existing entries, workflow docs, and
   automation files are not removed unless the user explicitly asks.

---

## Never

- Never commit `.env` files
- Never add `source_url` from blocked domains
- Never delete existing entries without explicit instruction
- Never use `innerHTML` without `escHtml()` on user-controlled strings
- Never add `dir="rtl"` to code blocks
- Never ship GitHub write tokens or other credentials to the browser/client

---

## Infrastructure Costs

Backend: Cloudflare Workers Free Tier
- 100,000 requests/day included
- $0/month at current usage
- Upgrade trigger: only if daily requests exceed 100k
- Paid tier if needed: $5/month

Hosting: GitHub Pages — $0/month forever

`data-center-archive`: plain GitHub repo (workflow docs + PDFs) — $0/month,
no Pages/Actions billing impact

AI: Anthropic API — pay per use (~$3-8/mo estimated at personal use volume)

Total: $0-8/month depending on API usage
