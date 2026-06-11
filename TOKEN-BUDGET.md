# Token Budget — Session Queue

Tracks the next planned Claude Code sessions for this project and their
rough scope, so each session can pick up the next item without re-deriving
priorities. See `CLAUDE.md`'s "Current Strategy (authoritative)" section and
`agents/STRATEGY.md` for the framing behind this order.

## Queue

1. **UI polish + verify AI Search end-to-end** — DONE (this session).
   Root cause found and fixed: `cloudflare-worker/worker.js` had
   `MODEL = 'claude-sonnet-4-20250514'`, which returns a 404
   `not_found_error` from Anthropic for this account — every AI
   Search/Diagnose/CLI-mode request was failing. Updated to
   `claude-sonnet-4-6` (committed `7d4dac3`, pushed). **Manual step
   still required**: redeploy `worker.js` to the `data-center-api`
   Cloudflare Worker (dashboard → Edit Code → paste → Deploy), then
   re-verify with a live `/api/chat` call. The relationship between the
   top `#search-input` (local DB only) and the AI Search tab is
   intentional/unchanged — not revisited this session.
2. **Mobile responsiveness + design optimization** — IN PROGRESS.
   Reviewed existing `@media` breakpoints (640px/768px/480px): tab-nav
   horizontal scroll, off-canvas AI sidebar, AI mode selector wrap, logo
   shrink, copy-btn touch targets, and tooltip max-width were already in
   place. Fixed one real bug this session: `#search-input`/`#ai-input`/
   `#admin-token-input` were below 16px, which triggers iOS Safari
   auto-zoom on focus — added a `font-size: 16px` override at ≤768px.
   Remaining for next session: tap-target sizing for `.tab-btn`/
   `.faq-pill`/`.filter-btn` (currently ~31px, below the 44px
   guideline), and a real visual pass in a mobile browser/devtools
   (no browser tooling available this session — only static CSS review).
3. **Consolidate agent runtime into one Gemini engine** — re-architect
   `agents/workers/agent-runner.js` so a single Worker role-plays all 11
   personas from `agents/config/agents-config.json`, instead of assuming
   11 independent Workers/Durable Objects. No deletions — existing configs
   become the engine's input data.
4. **Test the single Gemini agent against the live app** — run it through
   `data-center-api`'s `/api/chat`, verify mood/state transitions and
   reports per `agents-config.json`.
5. **Full 1-year office simulation run** — once items 1-4 are solid.

## Notes

- Each session should aim to stay within roughly 5,500 tokens of work
  before committing and pausing for review.
- Per `CLAUDE.md`'s Autonomous Brain Rules: commit locally, summarize what
  changed, and wait for explicit confirmation before `git push` to
  `master`.
