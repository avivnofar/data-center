# Contributing to Data Center

Thanks for helping improve this bilingual (Hebrew/English) IT troubleshooting
reference. This guide covers the basics; **`CLAUDE.md` is the source of
truth for all rules** — if anything here seems to conflict with it, follow
`CLAUDE.md`.

## Running locally

The app is a single static HTML file with no build step. Because `init()`
uses `fetch()` to load the JSON data files, you can't just open `index.html`
as a `file://` URL (CORS blocks it) — serve it instead:

```bash
python -m http.server 8080
# then open http://localhost:8080
```

Or, if you have Node: `npx serve .`

## Adding or editing content

All command/troubleshoot data lives in `data/*.json` and follows a bilingual
schema — every content field has a `_he` and `_en` variant (e.g. `desc_he` /
`desc_en`). Full field-by-field schemas, allowed `cat` values per file, and
the approved/blocked `source_url` domain lists are documented in
**`CLAUDE.md` → "Bilingual Schema"** and **"Rules for Adding New Content"**.
Read those before adding an entry — highlights:

- Every entry needs a unique, kebab-case `id` (troubleshoot entries start
  with `ts-`).
- No Hebrew characters in `cmd`, `quick_flags[].flag`, or `steps[].cmd` —
  commands are always LTR.
- `desc_he` and `desc_en` must be genuine, different translations, not the
  same text copy-pasted.
- `source_url` must come from the approved-domain allowlist in `CLAUDE.md`
  Rule 7. Don't add a new domain yourself — flag it instead (see
  `flagged/pending-review.md` and CLAUDE.md's "Source Flagging & Validation"
  section).

## Validating your changes

Before committing anything under `data/*.json`, run both validators:

```bash
node .github/scripts/validate-json.js
node .github/scripts/health-check.js
```

`validate-json.js` checks schema/field requirements; `health-check.js` runs
data-quality and Hebrew-content QA. Both must pass. If you touched
`index.html`, sanity-check it still loads locally via the dev server above.

## Commit & PR conventions

- Keep commits small and scoped to one logical change — avoid bundling
  unrelated edits (e.g. content changes with code changes) into one commit.
- Write commit messages that explain *why*, not just *what*.
- No build step, no bundler, no `package.json` — keep the zero-dependency,
  static-file architecture intact (`CLAUDE.md` → "No build step, ever").
- Never commit `.env` files or any credentials.

For anything not covered here — module structure, the AI backend, RTL
rendering rules, automation workflows — see `CLAUDE.md` and
`CURRENT-SPEC.md`.
