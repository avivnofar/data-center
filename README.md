# Data Center — IT Knowledge Base

A dark terminal-aesthetic IT troubleshooting reference for sysadmins, DevOps engineers, and IT students. Search commands, explore step-by-step troubleshoot scenarios, and click any command name to open its official documentation.

**Live site:** [avivnofar.github.io/data-center](https://avivnofar.github.io/data-center)

---

## What's inside

| Module | Entries | Description |
|--------|---------|-------------|
| Linux | 21 commands | Core Linux CLI: networking, processes, disk, permissions, logs, users |
| CMD / Windows | 11 commands | Windows administration from the command line |
| Network | 8 tools | Cross-platform: nmap, dig, tshark, iperf3, ufw, and more |
| Troubleshoot | 6 scenarios | Step-by-step runbooks for common production incidents |
| PowerShell | coming soon | — |
| Cloud / AWS | coming soon | — |
| Security | coming soon | — |
| Case Studies | coming soon | — |

Each command card includes:
- Usage examples with copy button
- Hover tooltip with useful flags (appears in 300ms)
- Click command name to open official documentation in new tab
- Expand card to see real-world scenarios, common mistakes, security notes, and quick flags

---

## Screenshot

![Data Center screenshot placeholder](https://via.placeholder.com/800x450/080b0f/39d353?text=Data+Center+screenshot)

---

## How to use

Just open the URL — no install needed:

**[avivnofar.github.io/data-center](https://avivnofar.github.io/data-center)**

- **Search:** type any keyword, error message, or describe your problem
- **Browse:** click a module tab (Linux, CMD, Network, Troubleshoot)
- **Filter:** use the category and level filters to narrow results
- **Expand:** click any card to see full detail
- **Open docs:** click the green command name to open official documentation
- **Copy:** click the `copy` button on any command to copy to clipboard

---

## How to run locally

```bash
# Option 1 — Python (no install required)
python -m http.server 8080
# open http://localhost:8080

# Option 2 — Node.js
npx serve .
```

Opening `index.html` directly as a `file://` URL will fail with a CORS error because the app fetches JSON files at runtime.

---

## How to contribute

1. Fork the repository
2. Add entries following the schemas defined in [CLAUDE.md](CLAUDE.md)
3. Every entry **must** have a valid `source_url` pointing to an approved official documentation domain
4. Run validation before opening a PR:
   ```bash
   node .github/scripts/validate-json.js
   ```
5. Open a pull request — the `validate.yml` workflow will check your changes automatically

**Rules:**
- `source_url` must point to an approved domain (man7.org, learn.microsoft.com, nmap.org, etc.) — see [CLAUDE.md](CLAUDE.md) for the full list
- No entries pointing to Stack Overflow, Reddit, Medium, or YouTube
- Unique `id` values across all files (kebab-case; troubleshoot IDs start with `ts-`)

---

## Technology stack

| Layer | Technology |
|-------|-----------|
| App | HTML, CSS, Vanilla JS — single file, no framework, no build step |
| Data | JSON files loaded at runtime via `fetch()` |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions (schema validation, auto-changelog, weekly health check) |
| Fonts | JetBrains Mono (Google Fonts) |

---

## Roadmap

| Phase | Status | Milestone |
|-------|--------|-----------|
| Phase 1 — Foundation | ![complete](https://img.shields.io/badge/status-complete-39d353) | Core app, 4 modules, GitHub Actions CI |
| Phase 2 — Extensible architecture | ![complete](https://img.shields.io/badge/status-complete-39d353) | Data-driven tabs, source URLs, hover tooltips |
| Phase 3 — Content expansion | ![planned](https://img.shields.io/badge/status-planned-e3b341) | PowerShell, Cloud/AWS, Security modules |
| Phase 4 — AI features | ![future](https://img.shields.io/badge/status-future-bc8cff) | Natural language search, AI runbooks |

---

## License

MIT — see [LICENSE](LICENSE) for details.
