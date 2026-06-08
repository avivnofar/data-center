# CLAUDE.md — SysOps Reference / data-center

## Project overview

SysOps Reference is a single-page IT troubleshooting knowledge base delivered as a static HTML file. It has no build step, no framework, and no server requirement. The UI is driven by vanilla JS that fetches four JSON data files at runtime and renders them into filterable, searchable command cards.

---

## Project structure

```
data-center/
├── index.html               # Entire app — HTML, CSS, and JS in one file
├── data/
│   ├── linux.json           # Linux CLI commands (21 entries)
│   ├── cmd.json             # Windows CMD commands (11 entries)
│   ├── network.json         # Cross-platform network tools (8 entries)
│   └── troubleshoot.json    # Step-by-step troubleshoot scenarios (6 entries)
├── .github/
│   └── workflows/
│       ├── validate.yml     # Validates JSON schema on every push
│       └── changelog.yml    # Auto-generates CHANGELOG.md on every push
├── CLAUDE.md                # This file
├── ROADMAP.md               # Upcoming milestones
├── CHANGELOG.md             # Auto-generated changelog
└── .gitignore
```

---

## Running locally

Because `init()` uses `fetch()` to load the data files, you must serve the project from an HTTP server — opening `index.html` directly as a `file://` URL will fail with a CORS error.

**Option 1 — Python (no install required on most systems):**
```bash
python -m http.server 8080
# then open http://localhost:8080
```

**Option 2 — Node.js `serve`:**
```bash
npx serve .
```

**Option 3 — VS Code Live Server extension:**
Right-click `index.html` → Open with Live Server.

---

## JSON schemas

All four files are JSON arrays. Each element must conform exactly to its schema. Fields marked **required** must be present; optional fields may be omitted.

### `data/linux.json`, `data/cmd.json`, `data/network.json`

These three files share the same command-entry schema:

```jsonc
{
  "id":       string,   // REQUIRED. Unique slug, kebab-case (e.g. "netstat", "ping-w")
  "name":     string,   // REQUIRED. Display name shown in the card header
  "cat":      string,   // REQUIRED. Category — see allowed values per file below
  "diff":     string,   // REQUIRED. "beginner" | "intermediate" | "advanced"
  "sec":      boolean,  // REQUIRED. true if a security note should be shown
  "desc":     string,   // REQUIRED. One-sentence description shown in collapsed card
  "usage": [            // REQUIRED. Array of usage examples, at least one
    {
      "cmd":  string,   // REQUIRED. The shell command exactly as typed
      "cmt":  string    // REQUIRED. Plain-English explanation of what the command does
    }
  ],
  "scenarios": [string],// REQUIRED. 2–4 bullet points: when to use this command
  "mistakes": [         // REQUIRED. 2 common mistakes
    {
      "x":    string,   // REQUIRED. Description of the mistake (plain text)
      "fix":  string    // REQUIRED. How to avoid it (may contain inline HTML <span>)
    }
  ],
  "secnote":  string,   // OPTIONAL. Security context note (may contain inline HTML)
  "tags":     string    // REQUIRED. Space-separated keywords used by the search engine
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
  "id":       string,   // REQUIRED. Unique slug, prefixed "ts-" (e.g. "ts-ssh")
  "title":    string,   // REQUIRED. Human-readable scenario title
  "plat":     string,   // REQUIRED. "linux" | "windows" | "network"
  "severity": string,   // REQUIRED. "critical" | "high" | "medium"
  "desc":     string,   // REQUIRED. One-sentence description of the failure mode
  "steps": [            // REQUIRED. Ordered diagnostic steps, at least 4
    {
      "n":    number,   // REQUIRED. Step number (1-based integer)
      "text": string,   // REQUIRED. What the step does (shown above the command)
      "cmd":  string,   // REQUIRED. The exact command to run
      "note": string    // REQUIRED. Explanation of what to look for in the output
    }
  ]
}
```

---

## Rules for adding new content

1. **Unique IDs** — every entry across all four files must have a unique `id`. Use kebab-case. Troubleshoot IDs must start with `ts-`.

2. **Preserve HTML in `fix` and `secnote`** — these fields render via `innerHTML`. Wrap inline code in `<span>text</span>`. Bold with `<b>text</b>`. No block elements.

3. **Tags are the search index** — the `tags` field drives full-text search. Include synonyms, common abbreviations, and related error messages (e.g. `"permission denied EACCES"`).

4. **Security notes only when dual-use** — set `"sec": true` and populate `"secnote"` only for commands that are meaningfully dual-use (usable by attackers) or that have non-obvious security footguns.

5. **Validate before pushing** — run the GitHub Actions `validate.yml` locally with `act`, or manually validate JSON with `node -e "JSON.parse(require('fs').readFileSync('data/linux.json'))"`.

6. **No build step** — do not introduce a bundler, transpiler, or package.json unless specifically adding a build pipeline. This project must remain deployable by simply copying files to any static host.

---

## Architecture notes

- `DB` is a module-level object initialised as `{ linux: [], cmd: [], network: [], troubleshoot: [] }` and populated by `async function init()` via `Promise.all(fetch(...))`.
- The search function (`globalSearch`) iterates all three command platforms plus troubleshoot entries, matching against `name`, `desc`, `tags`, `scenarios`, and `mistakes`.
- `renderCard()` and `renderTS()` generate HTML strings and set `innerHTML` directly — no virtual DOM, no framework.
- All CSS is scoped inside the single `<style>` block in `index.html`. CSS variables are defined in `:root`.
