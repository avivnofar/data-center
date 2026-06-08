# Roadmap

Current version: **v1.0** — static, client-side knowledge base with 46 entries across Linux, Windows CMD, network tools, and troubleshooting scenarios.

---

## Phase 2 — Anthropic API AI Search

Replace the current keyword-only search bar with a natural-language query engine powered by the Anthropic Claude API.

**Planned features:**
- Type a problem in plain English ("my nginx keeps crashing after 2 hours") and receive ranked results with an AI-generated summary explaining which commands and scenarios are most relevant.
- Fallback gracefully to the existing keyword search when the API is unavailable or rate-limited.
- The `AI — coming soon` badge in the search bar becomes the entry point.
- API key is injected via a server-side proxy so it is never exposed in client JS.

**Why this matters:** The current `tags` field is a manual approximation of semantic search. Claude can understand intent and match against descriptions and scenario text that keywords miss.

---

## Phase 3 — Electron Desktop App

Package the knowledge base as a cross-platform native desktop application.

**Planned features:**
- Offline-first: all data and the AI search cache are bundled inside the app, no internet required for core features.
- Global hotkey to open the search overlay from any window (like Alfred or Raycast, but for sysadmin commands).
- Auto-update: new command entries are pulled from the upstream JSON files on launch.
- Tray icon with a quick-access menu for most-recently-used commands.

**Why this matters:** In an active incident, sysadmins can't always open a browser. A hotkey-triggered overlay is orders of magnitude faster than opening a tab and navigating to a URL.

---

## Phase 4 — Community Contributions

Open the knowledge base to community-maintained entries via a structured contribution workflow.

**Planned features:**
- `CONTRIBUTING.md` with a guided template for new command entries and troubleshoot scenarios.
- Pull request template pre-filled with the JSON schema and a checklist.
- The `validate.yml` CI workflow already enforces schema correctness, so contributed PRs are blocked from merging if entries are malformed.
- A web-based submission form (GitHub Discussions or a simple form-to-PR GitHub Action) to lower the barrier for non-git contributors.
- Tagging system to credit contributors in the `secnote` or entry metadata.

**Why this matters:** The current 46-entry database covers common scenarios but misses specialized domains (cloud CLI, Kubernetes, database administration, container networking). Community contributions scale this without a single-maintainer bottleneck.
