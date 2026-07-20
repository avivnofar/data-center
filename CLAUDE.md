# CLAUDE.md — Data Center IT Knowledge Base

## Project Overview

**Data Center** is a static single-page bilingual (Hebrew/English) IT
troubleshooting reference for IT professionals broadly — sysadmins, DevOps
engineers, helpdesk/support teams, and IT students. It delivers searchable
command cards, hover tooltips, step-by-step troubleshoot scenarios, an
AI Search assistant, and an interactive terminal simulator — all as a
zero-dependency static HTML file deployable to any static host.

**Live site:** [avivnofar.github.io/data-center](https://avivnofar.github.io/data-center)

**Hebrew default:** The UI defaults to Hebrew with RTL layout. Language is
toggled via a button and stored in `localStorage` key `dc-lang`.

**Feature status:** this file holds rules and standards only. For what is
actually implemented and verified working, see **`CURRENT-SPEC.md`** —
do not duplicate feature detail here.

### Scope

- **Current**: general IT support — Linux, Windows/CMD, networking,
  troubleshooting scenarios, plus vendor-specific PBX modules (1COM,
  MirtaPBX) kept as content modules like any other.
- **Expanding toward**: cybersecurity (a `security` module is registered as
  `coming-soon`, alongside `powershell`, `cloud`, `docker`, `cicd`,
  `casestudies`, `cli`).
- **Not the scope**: the app is not scoped to any single company. Netvill/
  1COM/MirtaPBX content remains as historical/example data modules, not the
  boundary of the project.

### Related repositories

- [`office-AI-agents`](https://github.com/avivnofar/office-AI-agents) — the
  AI agent office simulation. **A separate project entirely**: data-center
  has no involvement in its planning or execution, and as of 2026-07-19 has
  **zero code coupling** to it (the former in-app "Office" tab / Admin
  panel was removed from `index.html`). Do not reintroduce coupling.
- [`data-center-archive`](https://github.com/avivnofar/data-center-archive)
  — longer-form bilingual workflow documents rendered in the in-app
  Workflows tab, plus generated PDFs. Keep it lean: workflow `.md` files
  and PDFs only.
- [`Notebook-X`](https://github.com/avivnofar/Notebook-X) — knowledge
  notebooks project. See "Future Vision" below.

---

## Folder Structure

```
data-center/
├── index.html                   # Entire app — HTML + CSS + JS in one file
├── data/
│   ├── modules.json             # Tab registry — source of truth for all modules
│   ├── linux.json               # Linux commands
│   ├── cmd.json                 # Windows CMD commands
│   ├── network.json             # Cross-platform network + VoIP/SIP tools
│   ├── 1com.json                # 1COM PBX platform reference
│   ├── mirtapbx.json            # MirtaPBX platform reference
│   ├── troubleshoot.json        # Step-by-step troubleshoot scenarios
│   └── tools.json               # Registry of standalone tools (CommandFlow)
├── tools/
│   └── commandflow/             # Terminal Academy — standalone terminal simulator
│                                # (also powers in-app CLI Mode via commandflow-core.js)
├── cloudflare-worker/           # AI Search backend (Cloudflare Worker, Claude API)
│   ├── worker.js
│   ├── wrangler.toml
│   └── README.md                # Deployment guide
├── flagged/                     # Source flagging system (pending → approved/rejected)
├── .github/
│   ├── scripts/                 # validate-json.js, health-check.js, check-links.js
│   └── workflows/               # validate, health, link-check, monthly-review, changelog
├── .nojekyll
├── CLAUDE.md                    # This file — rules and standards
├── CURRENT-SPEC.md              # Living technical spec + verified feature status
├── TOKEN-BUDGET.md              # Session history / queue log
├── CHANGELOG.md                 # Auto-generated
└── README.md                    # Public landing page
```

---

## Running Locally

`init()` uses `fetch()` — opening as `file://` fails with CORS. Use:

```bash
python -m http.server 8080
# open http://localhost:8080
```

Or: `npx serve .`

---

## AI Backend (`cloudflare-worker/worker.js`)

- **Model**: `claude-sonnet-5` (the `MODEL` constant in `worker.js`).
- Secure proxy — the Anthropic API key exists **only** as a Worker secret;
  the static site never sees it. Deployment steps: `cloudflare-worker/README.md`.
- **Three AI modes** in the app (strict radio — exactly one active,
  persisted in `localStorage` key `dc-modes`): Free Search (`search`),
  Solve a Case (`diagnose`), and CLI. The Worker only knows
  `search`/`diagnose`; CLI mode is client-side (CommandFlow) and falls
  through to `search` for unrecognized commands.
- **Vision**: the request body accepts an `images` array (max 3, base64 +
  `media_type`); the Worker injects them into the last user message as
  `type:'image'` content blocks. The UI supports both an attach button
  (`#ai-attach-btn`) and paste-from-clipboard.
- **Web search**: the Claude call includes the `web_search` tool (max 3
  uses) so answers can search and cite live sources.
- **Notebook-X index injection**: `getNotebookXContext()` fetches
  `Notebook-X/notebooks/_index-public.json` at request time and appends a
  short list of available notebooks to the system prompt. This is
  read-only awareness — see "Future Vision".
- **Self-extension / self-education (suggest-only, prompt-side only)**:
  the system prompt instructs Claude to append plain-text
  `CAPABILITY_SUGGESTION: {...}` / `LEARNED_SOURCE: {...}` lines after a
  `---` separator when it spots a knowledge-base gap or a good new source.
  **No client-side handler exists yet** — the blocks render as text and a
  human acts on them manually (see CURRENT-SPEC.md #7-#10). If a handler
  is ever built, Issue filing must go through a server-side component (the
  Worker never gets GitHub write access), and learned sources must pass
  Source Validation (below) before touching `data/*.json`.

---

## Bilingual Schema

All JSON files use a bilingual field naming convention:
- `field_he` — Hebrew content
- `field_en` — English content

The `t(entry, 'field')` helper in `index.html` returns the correct language based on `LANG`.

### `data/linux.json`, `data/cmd.json`, `data/network.json`, `data/1com.json`, `data/mirtapbx.json`

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
| `network.json` | `diagnostic`, `ports`, `routing`, `dns`, `firewall`, `voip` |
| `1com.json` | `hardware`, `config`, `ivr`, `queue`, `omnichannel`, `monitoring`, `integration` |
| `mirtapbx.json` | `architecture`, `cluster`, `sip`, `recording`, `reporting`, `integration`, `webrtc` |

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

**Adding a new module**: add the entry to `modules.json` with
`status: "coming-soon"`, create the data file following the schema above,
add its category set to the validator if new, then flip to `"active"`.
Tabs are fully data-driven — zero hardcoded tabs in `index.html`.

---

## Rules for Adding New Content

1. **Unique IDs** — every entry across all data files must have a unique `id`. Use kebab-case. Troubleshoot IDs must start with `ts-`.

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
   - `asterisk.org`, `1com.co.il`, `mirtapbx.com`, `queuemetrics.com`
     (vendor-official docs for the 1COM / MirtaPBX PBX modules — see
     `flagged/approved-sources.md`)

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

## Hebrew/English RTL Rendering Rules

Mixed Hebrew/English text is the app's hardest rendering problem. The rules:

- **Static data content** uses `<span class="ltr-term">` around inline
  English terms in Hebrew fields (Rule 4 above).
- **AI chat responses** are handled by `wrapLtrTerms(segment)` in
  `index.html`, called from `renderMarkdown()` on plain text segments
  *outside* backtick code spans. It wraps URLs, IPs, file/registry paths,
  and CLI flags — and, in Hebrew responses only, version numbers and
  standalone English words/acronyms — in
  `<span dir="ltr" style="unicode-bidi:isolate">`. All AI modes render
  through `renderMarkdown()`, so the fix applies everywhere.
- **Code is always LTR**: fenced blocks render as `<pre dir="ltr">`,
  inline code as `<code dir="ltr">`. Never add `dir="rtl"` to code.
- When touching this area, test with a mixed Hebrew sentence containing a
  flag (`-n`), a path (`/var/log`), an IP, and a version number.

---

## Architecture Notes

- `DB` is a module-level object populated by `async function init()` via `Promise.all(fetch(...))`.
- Tab system is fully data-driven from `modules.json` — zero hardcoded tabs in `index.html`.
- `t(obj, key)` returns `obj.key_he` or `obj.key_en` based on `LANG` global.
- `tArr(obj, key)` same for array fields (`scenarios_he/en`).
- `renderCard()` and `renderTsCard()` generate HTML strings and set `innerHTML`. All user strings pass through `escHtml()` before insertion.
- Hover tooltip: 200ms delay, viewport-aware position calculation, hides on mouseleave.
- Language toggle: sets `LANG`, saves to `localStorage`, calls `applyLang()` + re-renders active tab.
- **CLI Mode** is backed by CommandFlow (`tools/commandflow/commandflow-core.js`
  + `commands.json`, 7 platforms). Recognized commands render instantly
  client-side at zero API cost; unmatched input falls through to Claude.
  Adding platforms/commands is data-only — edit `commands.json`.

---

## Workflows Archive (`data-center-archive`)

The **Workflows** tab renders longer-form bilingual workflow documents from
the sibling `data-center-archive` repo.

- Workflow metadata lives in the `WORKFLOWS` array in `index.html` (id,
  bilingual title/desc, `path`, `updated`).
- `openWorkflow(id)` fetches `ARCHIVE_RAW_BASE + wf.path`
  (raw.githubusercontent.com) and renders it via `renderMarkdown()`.
- **Graceful fallback**: if the fetch fails, the panel shows a bilingual
  "archive not connected yet" message linking to GitHub instead of erroring.
- **PDF export**: the "📄 Generate PDF" FAB calls `generatePdf()` →
  `window.print()`, with a `@media print` block that isolates the active
  workflow (`.print-target`) and keeps code LTR. No PDF library, no build
  step. PDFs are saved manually into `data-center-archive/pdfs/`.
- **Keep the archive lean** — only workflow markdown and generated PDFs
  belong there. Research notes belong in Claude's persistent memory.

---

## Bookmark System

In AI chat responses, any URL Claude mentions gets a small "bookmark bar"
(`renderBookmarkBars()`) with **Save** / **Dismiss** actions. Saved URLs
persist to `localStorage` (`dc-bookmarks` / `dc-dismissed-bookmarks`).
**Client-side only, no credentials** — never reintroduce a design that
ships write tokens to the browser; any future "save to archive" must go
through a server-side component.

---

## Source Flagging & Validation (very high strictness)

`flagged/` tracks candidate documentation sources: `pending-review.md` →
`approved-sources.md` or `rejected-sources.md`. The domain allowlist/blocklist
(Rules 7-8) governs **domains**; `flagged/` tracks specific **URLs**.

For all AI-suggested sources (AI Search, `LEARNED_SOURCE` blocks):

- **The approved-domain allowlist is necessary but not sufficient.** A URL
  from a publisher/path not cited before goes into
  `flagged/pending-review.md` and is never added to `data/*.json` until
  reviewed by a human (or a Claude Code session on their behalf).
- **Untrusted publishers require cross-checking** against at least one
  other approved source before being cited as authoritative.
- **Sources approved in the last 30 days are re-verified** before being
  reused as the basis for a new knowledge-base entry.
- **Quarantine, never auto-trust** — no automated process promotes a URL
  to `approved-sources.md`.

---

## Automation Workflows

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `validate.yml` | every push/PR | Schema + bilingual field validation (`validate-json.js`) |
| `link-check.yml` | daily 06:00 UTC | Checks every `source_url` is reachable (`check-links.js`); opens/closes a `broken-link` issue |
| `health.yml` | weekly, Mon 08:00 UTC | Data quality + Hebrew QA (`health-check.js`); opens a `data-quality` issue on critical failure |
| `monthly-review.yml` | monthly, 1st @ 08:00 UTC | Opens a `source-review` issue if `flagged/pending-review.md` has unreviewed entries |
| `changelog.yml` | on push to master | Auto-generates `CHANGELOG.md` |

All scheduled workflows also support `workflow_dispatch`. None require
secrets beyond the default `GITHUB_TOKEN`.

---

## Unattended Twice-Daily Automation (local Task Scheduler)

Separate from the GitHub Actions above, this repo runs a local, unattended
Claude Code pipeline twice daily on the owner's machine — full design in
`automation/DATA_CENTER_AUTOMATION_SPEC.md`, exact operating procedure in
`automation/instructions_builder.txt` / `automation/instructions_auditor.txt`.

- **Two-run model**: each wake time runs the same kind of session but plays
  a different role. **02:30 — Builder** (`automation/run_dc_1_builder.bat`):
  picks one eligible item from `automation/TODO_LIST.md`, does the work on a
  fresh `dc-auto-<STAMP>` branch off `master`, validates, commits in small
  increments, and pushes the branch to origin — never touches `master`.
  **07:28 — Auditor** (`automation/run_dc_2_auditor.bat`): independently
  re-verifies (never trusts) the prior Builder branch against the
  Push-Authorization Checklist, merges to `master` only if every item
  passes, and always runs a standing daily audit into
  `automation/DATA_CENTER_AUDIT.md`. Both wake times are chained as a
  second Task Scheduler action after the existing `data-center-archive`
  (smart-archive) automation's own actions — Task Scheduler runs actions
  in a task unconditionally in sequence, so the data-center action still
  runs even if the archive action ahead of it fails.
- **Push-Authorization Checklist — the one narrow, explicit exception to
  "pause before pushing to master"** (Autonomous Brain Rules, below): the
  Auditor run may merge a Builder branch and push `master` directly,
  without a human in the loop, but *only* if every one of these holds —
  any single failure means leave the branch local/unpushed and flag it in
  `automation/NEEDS_YOUR_REVIEW.md` instead:
  1. The diff touches only files in the TODO item's own "Files/areas".
  2. Zero new/changed `source_url` values anywhere in the diff.
  3. No `data/*.json` schema changes, no deletions, no changes to
     `.github/workflows/`, `wrangler.toml`, or anything credential-adjacent.
  4. Both validators pass clean on the Auditor's own independent re-run.
  5. The diff's actual content matches the item's Definition of Done.

  This is a checklist, not a risk judgment — this exception does not
  extend to any other unattended session, and covers only the merge
  described above (the branch's own files, plus — as part of that same
  successful-merge commit — `TODO_LIST.md`'s `## Completed` move and the
  state/run-log updates).
- **Daily Audit Pass — a second, separate, unconditional exception**: every
  Auditor run, independent of whether STEP 1's merge happens or is
  declined, also appends a dated section to `automation/DATA_CENTER_AUDIT.md`
  and pushes *that file alone* directly to `master` — no checklist gate,
  no human in the loop, because it's audit output about repo/automation
  state, not a code or content change (mirrors the equivalent exception in
  the `data-center-archive` automation). This is not covered by the
  Push-Authorization Checklist above; it is its own narrower exception,
  scoped to that one file only. See `automation/DATA_CENTER_AUTOMATION_SPEC.md`
  §9 and `automation/instructions_auditor.txt` STEP 2.
- **TODO-005 through TODO-011 are paused**: no Builder run may author
  content for the `powershell`, `cloud`, `security`, `docker`, `cicd`,
  `casestudies`, or `cli` modules until the Notebook-X integration
  architecture decision (`automation/NEEDS_YOUR_REVIEW.md`) resolves — see
  that file's TODO-005–011 entry for why.
- Guardrails are enforced at the CLI tool level via `--disallowedTools`
  (both runs: `Bash(rm:*)`, `Bash(git push --force*)`,
  `Bash(git reset --hard:*)`; Builder additionally blocks
  `Bash(git push origin master*)` and `Bash(git merge*)`), not left to
  prompt instructions alone.

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

1. **Memory over files for research** — reference information (links,
   domain notes, prior decisions) goes to Claude's persistent memory
   (`~/.claude/projects/.../memory/`), not new repo files.
2. **Keep both repos lean** — `data-center-archive` holds only workflow
   `.md` files and PDFs. This repo holds the app, data, automation, and
   `flagged/`. No "just in case" reference dumps.
3. **Security first** — never ship write credentials (GitHub tokens, API
   keys) to the browser. `localStorage` is fine for user-local state;
   anything that writes to GitHub or calls paid APIs goes through the
   Cloudflare Worker.
4. **No build step, ever** — solve new requirements within the
   static-HTML-plus-`fetch()` architecture.
5. **Validate before committing** — run `validate-json.js` and
   `health-check.js` after touching `data/*.json`; sanity-check
   `index.html` loads locally after JS/CSS edits.
6. **Pause before pushing to `master`** — commit locally, summarize what
   changed, and wait for explicit confirmation before `git push`.
7. **Don't delete without instruction** — existing entries, workflow docs,
   and automation files are not removed unless the user explicitly asks.

---

## Never

- Never commit `.env` files
- Never add `source_url` from blocked domains
- Never delete existing entries without explicit instruction
- Never use `innerHTML` without `escHtml()` on user-controlled strings
- Never add `dir="rtl"` to code blocks
- Never ship GitHub write tokens or other credentials to the browser/client

---

## Future Vision (planned, not started)

**Notebook-X integration**: enrich Claude's AI Search answers with the
Notebook-X project's in-depth knowledge notebooks. Phase 1 (index injection
via `getNotebookXContext()`) is implemented — see CURRENT-SPEC.md for
current status. Actual notebook *content* retrieval is **not started**.
Revisit only once the core app is stable — do not build ahead of need.

---

## Infrastructure Costs

- Backend: Cloudflare Workers Free Tier (100k requests/day) — $0/month at
  current usage; $5/month paid tier only if exceeded.
- Hosting: GitHub Pages — $0/month.
- `data-center-archive`: plain GitHub repo — $0/month.
- AI: Anthropic API (`data-center-api`, model `claude-sonnet-5`) — pay per
  use, ~$3-8/month estimated at personal-use volume.

Total: roughly $0-10/month; most months land near the low end.
