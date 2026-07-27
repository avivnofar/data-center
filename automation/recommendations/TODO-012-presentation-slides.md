# TODO-012 — Presentation/Slide Generation: Feasibility & Design

**Status:** scoping only, per TODO-012's own Definition of Done — this is a
recommendation, not an implementation. Written 2026-07-25 by an unattended
Builder session.

## Verdict: **Conditional go** — small, in-scope slice only

Full slide-deck authoring (drag-and-drop layout, themes, export to native
`.pptx`) is **no-go** — it would require a client-side library
(reveal.js, PptxGenJS, etc.) or a build step, both of which conflict with
CLAUDE.md Rule 11 ("no build step, ever") and the zero-dependency,
single-`index.html` architecture. That's out of scope for this project.

A **much narrower slice — turning existing Workflow markdown into a
click-through, presentable, exportable slide view** — fits the existing
architecture cleanly and is a reasonable "go."

## What would populate slides

Workflow documents (`workflows/*.md`, indexed via `data/workflows.json`,
rendered today by `renderMarkdown()` in the Workflows tab) are the only
existing content type that's already long-form and structured with
headings — a natural fit for slide-per-section. Command-card summaries
(`linux.json`/`cmd.json`/etc.) are short reference cards, not a good fit
for a slide narrative; they're already optimized for search/scan, not
presentation. **Recommendation: scope this to Workflow docs only** — do
not build a second content pipeline for command-card slides.

## Why the existing PDF-export pattern is the right base to extend

The Workflows tab already solves the "zero-build-step, no library" export
problem for a very similar need: `generatePdf()` (`index.html:2780`) is a
one-line `window.print()` call, paired with a `@media print` block
(`index.html:1502-1506`) that isolates `.print-target` content (added to
`#workflow-detail-content` by `openWorkflow()`, `index.html:2755`) and
keeps code blocks LTR during print. This is the same trick a "slides"
feature needs, just with a different print stylesheet:

- **Slide view (screen)**: split the already-rendered workflow HTML on
  its `<h2>` boundaries (the markdown renderer already produces real
  heading elements — no new parsing format needed) into full-viewport
  `.slide` sections, add prev/next buttons + arrow-key navigation, no new
  content model, no new data file.
- **Slide export (print)**: extend the existing `@media print` block with
  `.slide { page-break-after: always; }` so each slide lands on its own
  printed/PDF page — reusing `generatePdf()`/`window.print()` verbatim,
  just with a second print stylesheet variant scoped to a `.slide-mode`
  class instead of `.print-target` alone.

No new dependency, no new data file, no new backend call — entirely
CSS + a small amount of DOM-splitting JS layered on code that already
exists and is already proven (Workflows PDF export has been live and
usable since the `data-center-archive` retirement).

## Scope boundary

- In scope: a "Present" toggle on an already-open Workflow doc, splitting
  it into slides by heading, with next/prev navigation and print/PDF
  export via the existing `window.print()` pattern.
- Out of scope (do not build without a separate owner decision): authoring
  slides from scratch in-app, command-card-to-slide summaries, native
  `.pptx`/`.key` export, animations/transitions beyond a simple slide
  change, any third-party slide library.

## Follow-up TODOs (added to `automation/TODO_LIST.md`)

- **TODO-026** — Implement Workflow "Present" slide view (heading-split
  navigation, screen-only).
- **TODO-027** — Extend `@media print` for per-slide page breaks (PDF/print
  export of the slide view), reusing `generatePdf()`.

Both are additive to `index.html` only, no `data/*.json` schema change, no
new `source_url`s, no new dependency — should clear the Push-Authorization
Checklist's usual bar cleanly once implemented, unlike this scoping item
itself.
