# CLAUDE.md — Data Center IT Knowledge Base
## Complete Project Bible

---

## Project Purpose and Audience

**Data Center** is a static single-page IT troubleshooting reference built for sysadmins, DevOps engineers, and IT students. It provides searchable, filterable command reference cards with usage examples, security notes, common mistakes, and official documentation links — all delivered as a zero-dependency static HTML file that deploys instantly to any static host.

**Primary audience:** Junior to mid-level sysadmins, DevOps practitioners, and IT students who need quick, reliable command references during incidents.

---

## Folder Structure

```
data-center/
├── index.html                   # Entire app — HTML + CSS + JS in one file
├── data/
│   ├── modules.json             # Registry of all technology modules (tab config)
│   ├── linux.json               # Linux CLI commands
│   ├── cmd.json                 # Windows CMD commands
│   ├── network.json             # Cross-platform network tools
│   └── troubleshoot.json        # Step-by-step troubleshoot scenarios
├── .github/
│   ├── workflows/
│   │   ├── validate.yml         # Schema + source URL validation on every push/PR
│   │   ├── changelog.yml        # Auto-generates CHANGELOG.md on push to main/master
│   │   └── health.yml           # Weekly data quality report (Mondays 08:00 UTC)
│   └── scripts/
│       ├── validate-json.js     # Validation script (run by validate.yml)
│       └── health-check.js      # Health check script (run by health.yml)
├── CLAUDE.md                    # This file
├── ROADMAP.md                   # Upcoming milestones
├── CHANGELOG.md                 # Auto-generated changelog
├── README.md                    # Public-facing project README
└── .gitignore
```

---

## Running Locally

Because `init()` uses `fetch()` to load JSON files, you **must** serve from an HTTP server — `file://` URLs will CORS-error.

```bash
python -m http.server 8080
# then open http://localhost:8080
```

---

## Data Schemas

### `data/modules.json` — Module Registry

Controls which tabs appear in the UI. **Adding a new technology requires only adding an entry here and creating the data file — zero changes to index.html.**

```jsonc
{
  "id":          string,   // REQUIRED. Unique module slug (e.g. "linux", "powershell")
  "label":       string,   // REQUIRED. Display name in tab bar
  "icon":        string,   // REQUIRED. Emoji icon for tab
  "data_file":   string,   // REQUIRED. Path to data file (e.g. "data/linux.json")
  "status":      string,   // REQUIRED. "active" | "coming-soon"
  "filter_type": string,   // REQUIRED. "command" | "troubleshoot" | "casestudy"
  "categories": [string]   // REQUIRED. Array of valid category values for this module
}
```

### `data/linux.json`, `data/cmd.json`, `data/network.json` — Command Entries

```jsonc
{
  "id":          string,   // REQUIRED. Unique slug, kebab-case (e.g. "netstat", "ping-w")
  "name":        string,   // REQUIRED. Display name shown in card header
  "cat":         string,   // REQUIRED. Category — see allowed values per file below
  "diff":        string,   // REQUIRED. "beginner" | "intermediate" | "advanced"
  "sec":         boolean,  // REQUIRED. true if a security note should be shown
  "desc":        string,   // REQUIRED. One-sentence description shown in collapsed card
  "source_url":  string,   // REQUIRED. Official docs URL — must be on approved domains list
  "source_name": string,   // REQUIRED. Human-readable source name (e.g. "Linux man page (man7.org)")
  "usage": [               // REQUIRED. At least one usage example
    {
      "cmd":     string,   // REQUIRED. The shell command exactly as typed
      "cmt":     string    // REQUIRED. Plain-English explanation of what the command does
    }
  ],
  "quick_flags": [         // OPTIONAL (but strongly recommended). Shown in hover tooltip.
    {
      "flag":    string,   // REQUIRED. Flag string (e.g. "-t", "--force")
      "desc":    string    // REQUIRED. One-line description
    }
  ],
  "scenarios": [string],   // REQUIRED. 2–4 real-world use cases
  "mistakes": [            // REQUIRED. 2 common mistakes
    {
      "x":       string,   // REQUIRED. Description of the mistake
      "fix":     string    // REQUIRED. How to avoid it (may contain inline HTML <span>)
    }
  ],
  "secnote":     string,   // OPTIONAL. Security context (may contain inline HTML)
  "tags":        string    // REQUIRED. Space-separated keywords for search engine
}
```

#### Allowed `cat` values

| File | Valid categories |
|------|-----------------|
| `linux.json` | `network`, `process`, `disk`, `permission`, `system`, `logs`, `user` |
| `cmd.json` | `network`, `process`, `disk`, `system`, `user` |
| `network.json` | `diagnostic`, `ports`, `routing`, `dns`, `firewall` |

### `data/troubleshoot.json` — Troubleshoot Scenarios

```jsonc
{
  "id":          string,   // REQUIRED. Unique slug, prefixed "ts-" (e.g. "ts-ssh")
  "title":       string,   // REQUIRED. Human-readable scenario title
  "plat":        string,   // REQUIRED. "linux" | "windows" | "network" | "cross-platform"
  "severity":    string,   // REQUIRED. "critical" | "high" | "medium" | "low"
  "desc":        string,   // REQUIRED. One-sentence description of the failure mode
  "source_url":  string,   // REQUIRED. Official reference URL
  "source_name": string,   // REQUIRED. Human-readable source name
  "steps": [               // REQUIRED. At least 4 ordered diagnostic steps
    {
      "n":       number,   // REQUIRED. Step number (1-based)
      "text":    string,   // REQUIRED. What the step does
      "cmd":     string,   // REQUIRED. The exact command to run
      "note":    string    // REQUIRED. What to look for in the output
    }
  ]
}
```

---

## Approved Source Domains

`source_url` must resolve to one of these official/authoritative domains:

| Domain | Coverage |
|--------|----------|
| `man7.org` | Linux man pages |
| `linux.die.net` | Linux man pages (alternative mirror) |
| `learn.microsoft.com` | Microsoft official docs |
| `docs.microsoft.com` | Microsoft official docs (legacy) |
| `ss64.com` | Windows/Linux command reference |
| `linux.org` | Linux documentation |
| `kernel.org` | Linux kernel documentation |
| `iana.org` | Internet standards |
| `rfc-editor.org` | RFCs |
| `nmap.org` | nmap official docs |
| `wireshark.org` | Wireshark official docs |
| `ubuntu.com` | Ubuntu official docs |
| `redhat.com` | Red Hat official docs |
| `debian.org` | Debian official docs |
| `cloudflare.com` | Cloudflare docs |
| `cisco.com` | Cisco official docs |
| `tcpdump.org` | tcpdump official man pages |
| `iperf.fr` | iperf official docs |

**Blocked domains** (validation will fail): `stackoverflow.com`, `reddit.com`, `medium.com`, `youtube.com`, and any non-official blog domains.

---

## How to Add a New Technology Module

Adding a module requires **exactly two steps** — no changes to `index.html`:

1. **Add to `data/modules.json`:**
```json
{
  "id": "powershell",
  "label": "PowerShell",
  "icon": "💙",
  "data_file": "data/powershell.json",
  "status": "active",
  "filter_type": "command",
  "categories": ["network", "process", "disk", "system", "user"]
}
```

2. **Create `data/powershell.json`** with entries following the command entry schema above.

The tab, filter bar, and content panel are all generated automatically from modules.json at runtime.

---

## Rules Claude Must Follow in Every Session

### Before adding any content
- **Never add entries without a valid `source_url`** from the approved domains list
- **Always validate JSON** before committing: `node .github/scripts/validate-json.js`

### Before every commit
- Run `git status` to verify exactly what is being staged
- Never stage `.env` files, credentials, or large binaries
- Commit each logical change separately with a descriptive message

### HTML/security rules
- Fields that render via `innerHTML` (`fix`, `secnote`): only allow `<span>`, `<b>`, `<code>` — no block elements, no event handlers, no `<script>`
- `source_url` values are rendered as `href` — validate they start with `https://`
- All user-visible strings must be escaped via `escHtml()` before insertion as innerHTML

### After every session
- Append a one-line summary to `CHANGELOG.md` (the workflow does this automatically on push)
- If you add a new approved domain, update both `validate-json.js` and this CLAUDE.md

---

## Architecture Notes

- **`DB`** is populated from modules.json + data/*.json via `Promise.all(fetch(...))` in `init()`
- **Tab system** is fully data-driven: `index.html` reads `modules.json` at startup to render tabs and filter bars — adding a new module requires zero HTML changes
- **Hover tooltips** appear after 300ms on command name hover, showing `quick_flags` and source name; positioned to stay in viewport
- **Clicking a command name** (green text) opens `source_url` in a new tab — this is the official docs link
- **Clicking the card body** expands in-place with full detail
- **`renderCard()`** and **`renderTSCard()`** generate HTML strings with escaped content
- **`escHtml()`** used for all user-content interpolation; `secnote`/`fix` fields are trusted HTML (only use approved tags)
- All CSS is scoped inside the single `<style>` block; CSS variables in `:root`

---

## Roadmap Summary

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 — Foundation | ✅ Complete | Core HTML/CSS/JS app, 4 modules, GitHub Actions CI |
| Phase 2 — Extensible architecture | ✅ Complete | Data-driven tabs, source URLs, hover tooltips, modules.json |
| Phase 3 — Content expansion | 🚧 Planned | PowerShell, Cloud/AWS, Security modules |
| Phase 4 — AI features | 🔮 Future | Natural language search, AI-generated runbooks |
