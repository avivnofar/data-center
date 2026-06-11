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
2. **Mobile responsiveness + design optimization** — DONE.
   Reviewed existing `@media` breakpoints (640px/768px/480px): tab-nav
   horizontal scroll, off-canvas AI sidebar, AI mode selector wrap, logo
   shrink, copy-btn touch targets, and tooltip max-width were already in
   place. Fixed `#search-input`/`#ai-input`/`#admin-token-input` being
   below 16px (iOS Safari auto-zoom on focus — `font-size: 16px` override
   at ≤768px), and brought `.tab-btn`/`.filter-btn`/`.faq-pill` up to the
   44px minimum touch target (WCAG 2.5.5 / Apple HIG) at ≤768px (commit
   `122a4d4`). Verified via Playwright screenshots at 375px/768px/1280px
   — no console errors, layout intact.
3. **Consolidate agent runtime into one Gemini engine** — DONE (commit
   `b57fc99`). `agents/workers/agent-runner.js` is already a single Worker
   that role-plays all 11 personas via `instantiateAgent()` +
   `agents/config/agents-config.json` (v0.2.0, fully specified for all 11).
   `agents/README.md` and `agents/AGENTS.md` still describe agents 5-11
   with stale placeholder names — fix when next touching that folder.
4. **Test the single Gemini agent against the live app** — run it through
   `data-center-api`'s `/api/chat`, verify mood/state transitions and
   reports per `agents-config.json`. Blocked on item 1's Worker redeploy.
5. **Full 1-year office simulation run** — once items 1-4 are solid.

## Outstanding blocker

The deployed `data-center-api` Cloudflare Worker is still running stale
code (old 404ing model name) — `cloudflare-worker/worker.js` was already
fixed and pushed (commit `1b71238`, `MODEL = 'claude-sonnet-4-6'`) but
never redeployed. AI Search/Diagnose/CLI mode do not work until this is
redeployed via the Cloudflare dashboard or `wrangler` with a valid token.
Handoff docs for a session with dashboard access:
`C:\Users\97252\Documents\01 work\01 תיק עבודות\AI Projects\PROJECT-STATUS-FOR-WEB-CLAUDE.md`
and `CLOUDFLARE-WORKER-AGENT-API-ISSUE.txt`.

## Notes

- Each session should aim to stay within roughly 5,500 tokens of work
  before committing and pausing for review.
- Per `CLAUDE.md`'s Autonomous Brain Rules: commit locally, summarize what
  changed, and wait for explicit confirmation before `git push` to
  `master`.
