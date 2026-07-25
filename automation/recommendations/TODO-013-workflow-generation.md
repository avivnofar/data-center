# TODO-013 — Workflow Document Generation: Feasibility & Design Recommendation

*Scoping only, per `automation/TODO_LIST.md` TODO-013. No code changed as
part of this document.*

## Question

Workflow *viewing* already works end-to-end (self-hosted since
2026-07-20: `data/workflows.json` registers each doc, `openWorkflow()`
fetches same-origin from `workflows/*.md` and renders it via the shared
`renderMarkdown()`). Nothing generates a new workflow document today —
they're written by hand and committed manually. Should Data Center add a
"generation" path, and if so, what should it mean?

## What was checked

- `data/workflows.json` — 3 registered docs, each a flat bilingual record
  (`id`, `title_he/en`, `desc_he/en`, `path`, `updated`) pointing at a
  markdown file under `workflows/`.
- A sample doc (`workflows/linux/linux-workflow.md`) — consistent internal
  structure: a metadata header (version/last-updated/maintainer), a table
  of contents, then numbered `##` sections (Overview, Installation, Essential
  Commands, Troubleshooting, Real-World Scenarios, Security, Automation,
  Approved Resources, Recent Changes). Hebrew prose with
  `<span class="ltr-term">` wrapping English terms, exactly per `CLAUDE.md`
  Rule 4 — same convention as the JSON data fields.
- `openWorkflow()` (`index.html:2739-2763`) does a plain same-origin
  `fetch(wf.path)` — read-only, no write path anywhere in the Workflows tab
  code today.
- `automation/NEEDS_YOUR_REVIEW.md` already has a live precedent for the
  underlying tension here: the "GitHub write-credential decision" entry
  (blocking TODO-001's/TODO-002's Issue-filing half) establishes that *any*
  browser-triggered write to this repo is a new-credential decision needing
  owner sign-off — per `CLAUDE.md`, "the Worker never gets GitHub write
  access." A workflow-generation feature that commits directly would hit
  the exact same wall.

## Options considered

**(a) In-app editor that commits new markdown straight into `workflows/`.**
Would need the app (or its Worker) to hold GitHub write credentials —
squarely the same unresolved credential question already parked in
`NEEDS_YOUR_REVIEW.md` for TODO-001/TODO-002, and the same "Worker never
gets GitHub write access" rule in `CLAUDE.md`. Also a much bigger surface
than it first sounds: conflict handling, validating the new doc's
structure before it lands as a page a user will read, and (per the schema
above) keeping `data/workflows.json`'s registry in sync with whatever gets
committed. **Not recommended without a separate credential decision** —
would need its own `NEEDS_YOUR_REVIEW.md` entry before any implementation,
exactly as TODO-013's own description anticipates.

**(b) Client-side markdown template/preview tool — no commits.** A small
in-app form (topic title, target audience, section checklist mirroring the
structure above) that assembles a correctly-shaped markdown document
client-side — matching header metadata block, TOC skeleton, the same
numbered-section convention, `<span class="ltr-term">` reminders inline as
placeholder comments — and renders a live preview through the *existing*
`renderMarkdown()` (so the author sees exactly what `openWorkflow()` will
later render). The user copies the generated markdown out (or downloads it
as a `.md` file via a `Blob`/`URL.createObjectURL()` — no server round-trip,
no new dependency) and commits it manually, then adds the matching
`data/workflows.json` entry by hand — identical to how the 3 existing docs
were authored, just with the boilerplate/structure pre-filled. **Zero new
credentials, zero new infrastructure, fits the current architecture
exactly as-is.** **Recommended.**

**(c) Do nothing.** Not unreasonable — this is explicitly a "nice to have"
per CURRENT-SPEC.md (#23, "Requested But Never Built"), and hand-authoring
3 docs so far hasn't been a bottleneck. Noted as a legitimate alternative
if the owner would rather not spend the (modest) effort on (b) right now.

## Recommendation

**Go, with option (b), scoped narrowly to a template/scaffolding tool —
not a commit path.** Concretely, a follow-up implementation TODO should:

1. Add a small form (likely a modal, consistent with the existing
   Bookmarks-panel and Suggestion-card modal patterns already in
   `index.html`) collecting: title (bilingual), short description
   (bilingual), and a checklist of which of the standard sections
   (Overview / Installation / Essential Commands / Troubleshooting /
   Real-World Scenarios / Security / Automation / Approved Resources /
   Recent Changes) to include.
2. Assemble a markdown string client-side matching the existing docs'
   metadata-header + TOC + numbered-section shape, with placeholder prose
   per section reminding the author to wrap English terms in
   `<span class="ltr-term">` and to only cite `CLAUDE.md` Rule 7
   approved-domain sources.
3. Render the assembled markdown live through the existing
   `renderMarkdown()` so the preview matches exactly what `openWorkflow()`
   will later show a reader.
4. Offer a download (`Blob` + `URL.createObjectURL()`, no library) of the
   generated `.md`, plus the matching `data/workflows.json` entry as a
   copy-pastable JSON snippet — the user still commits both by hand, same
   as today.
5. Explicitly do **not** wire this to any GitHub write call. If direct
   commit-from-the-browser is ever wanted, that's a distinct, separate
   decision that must go through `NEEDS_YOUR_REVIEW.md` first (mirrors how
   TODO-001's parser/UI half shipped independently of its blocked
   Issue-filing half).

## Non-goals (this recommendation)

- No GitHub write credentials of any kind, on the client or the Worker.
- No changes to `renderMarkdown()`'s shared logic (used by AI chat too) —
  the template tool only *calls* it for preview, doesn't modify it.
- No automatic sync of `data/workflows.json` — the JSON snippet is
  generated for the human to paste in, not written automatically.

## Sizing

Small: one new modal + a client-side string-template function + reuse of
existing `renderMarkdown()`/`Blob` download pattern (the "📄 Generate PDF"
FAB already proves the no-library, `window.print()`/`Blob`-style approach
fits this codebase). Suggested as a new TODO item (e.g. `TODO-028`) sized
`S`, Files/areas: `index.html` only (new modal markup/CSS, template
assembly function, wired to a new topbar or Workflows-tab trigger button).
