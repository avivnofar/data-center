# CLAUDE.md — Data Center IT Knowledge Base
## Project Bible (Bilingual Edition)

---

## Project Overview

**Data Center** is a static single-page bilingual (Hebrew/English) IT troubleshooting reference built for sysadmins, DevOps engineers, and IT students. It delivers searchable command cards, hover tooltips, and step-by-step troubleshoot scenarios — all as a zero-dependency static HTML file deployable to any static host.

**Live site:** [avivnofar.github.io/data-center](https://avivnofar.github.io/data-center)

**Hebrew default:** The UI defaults to Hebrew with RTL layout. Language is toggled via a button and stored in `localStorage` key `dc-lang`.

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
├── .github/
│   ├── scripts/
│   │   ├── validate-json.js     # Schema + bilingual field validator
│   │   └── health-check.js      # Weekly quality checks with Hebrew QA
│   └── workflows/
│       ├── validate.yml         # Runs on every push/PR
│       ├── changelog.yml        # Auto-generates CHANGELOG.md
│       └── health.yml           # Weekly Monday 08:00 UTC + manual trigger
├── .nojekyll                    # Prevents GitHub Pages Jekyll processing
├── CLAUDE.md                    # This file
├── ROADMAP.md                   # Phase milestones
├── CHANGELOG.md                 # Auto-generated
└── .gitignore
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

## ⚠️ Hebrew Session Reminder

When adding new entries in a Claude Code session:
1. Run `node .github/scripts/health-check.js` before committing
2. Verify `desc_he` is in Hebrew (not English copy-pasted)
3. Verify all `cmd` fields have no Hebrew characters
4. Wrap English technical terms in `<span class="ltr-term">` in Hebrew text
5. `desc_he` and `desc_en` must be meaningfully different translations

---

## Never

- Never commit `.env` files
- Never add `source_url` from blocked domains
- Never delete existing entries without explicit instruction
- Never use `innerHTML` without `escHtml()` on user-controlled strings
- Never add `dir="rtl"` to code blocks

---

## Infrastructure Costs

Backend: Cloudflare Workers Free Tier
- 100,000 requests/day included
- $0/month at current usage
- Upgrade trigger: only if daily requests exceed 100k
- Paid tier if needed: $5/month

Hosting: GitHub Pages — $0/month forever

AI: Anthropic API — pay per use (~$3-8/mo estimated at personal use volume)

Total: $0-8/month depending on API usage
