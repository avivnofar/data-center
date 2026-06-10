# Roadmap — Data Center

Current version: **v2.0** — bilingual Hebrew/English static knowledge base with 64 entries, RTL support, hover tooltips, and bilingual CI validation.

---

## Phase 1 — Foundation ✅ (Done)

- [x] Static single-page app with dark terminal aesthetic
- [x] Data-driven tab system from `modules.json`
- [x] Hebrew/English bilingual schema with RTL layout
- [x] `<html dir="rtl">` default, language toggle stored in `localStorage`
- [x] Noto Sans Hebrew + JetBrains Mono fonts
- [x] Hover tooltips with quick flags, 200ms delay, viewport-aware
- [x] Command name click opens official `source_url`
- [x] Global search (Hebrew + English)
- [x] Hebrew FAQ pills
- [x] Bilingual JSON schema: `desc_he/en`, `scenarios_he/en`, `mistakes` with `x_he/x_en/fix_he/fix_en`
- [x] GitHub Actions: validate.yml (bilingual schema checks on push/PR)
- [x] GitHub Actions: health.yml (weekly Monday 08:00 UTC + manual trigger)
- [x] health.yml: GitHub Issue created on critical failures
- [x] `.nojekyll` for GitHub Pages compatibility
- [x] 27 Linux entries, 15 CMD entries, 12 Network entries, 10 Troubleshoot scenarios

## Phase 2 — Claude AI Search Integration (Planned)

- [ ] Claude API backend proxy (Node.js / Python serverless function)
- [ ] Natural-language query: "מה עושים כשה-SSH קורס?" → מפנה לכרטיסים הרלוונטיים
- [ ] Semantic search across all modules
- [ ] AI-generated troubleshoot hints per command

## Phase 3 — Expanded Content Modules

- [ ] PowerShell module (20+ cmdlets)
- [ ] Cloud / AWS CLI module (aws ec2, s3, iam...)
- [ ] Security audit module (nmap scripts, Lynis, auditd...)
- [ ] Docker / Containers module (docker, docker-compose, kubectl basics)
- [ ] CI/CD module (GitHub Actions, Jenkins CLI, GitLab CI)

## Phase 4 — Community & Contributions

- [ ] Contribution guide (`CONTRIBUTING.md`)
- [ ] GitHub Discussions for community Q&A
- [ ] PR template for new entries (bilingual schema checklist)
- [ ] Auto-tag: entries contributed by community vs. curated

## Phase 5 — Offline / Desktop

- [ ] Electron wrapper for offline `.exe` / macOS app
- [ ] PWA (Service Worker) for offline browser use
- [ ] Local-first data sync

## Phase 6 — Advanced Features

- [ ] Bookmarking / favorites (localStorage)
- [ ] Copy-to-clipboard on command click
- [ ] Export PDF cheat sheet
- [ ] Dark/light theme toggle
