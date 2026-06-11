# Token Budget — Session Queue

Tracks the next planned Claude Code sessions for this project and their
rough scope, so each session can pick up the next item without re-deriving
priorities. See `CLAUDE.md`'s "Current Strategy (authoritative)" section and
`agents/STRATEGY.md` for the framing behind this order.

## Queue

1. **UI polish + verify AI Search end-to-end** — DONE.
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

RESOLVED (worker redeploy). The `data-center-api` Cloudflare Worker was
redeployed with the fixed `cloudflare-worker/worker.js` (commit `1b71238`,
`MODEL = 'claude-sonnet-4-6'`) via the Cloudflare dashboard. Live
`/api/chat` test confirms a correct streaming response — AI Search/
Diagnose/CLI mode are working end-to-end. Item 4 (test the single Gemini
agent against the live app) is now unblocked.

NEW BLOCKER (Cloudflare auth). `.env.cloudflare` still has the placeholder
`CLOUDFLARE_API_TOKEN=paste-token-here`, there is no `CLOUDFLARE_API_TOKEN`
env var, and `npx wrangler whoami` reports "not authenticated". This blocks
the Part 3 deploy/smoke-test steps below — needs either a real token pasted
into `.env.cloudflare` or an interactive `wrangler login` before next
session can proceed.

## Launch session progress (2026-06-11)

Per the project owner's "Launch Decisions" prompt (cost model, sim params,
checkpoints, report tiering, stop logic, models, architecture, token
discipline — now documented in `CLAUDE.md`'s "Launch Decisions
(authoritative)" section):

- **Part 2 — brain/capability config**: DONE, committed.
  - `cloudflare-worker/worker.js`: added `web_search_20250305` tool
    (max_uses 3) + system-prompt `CAPABILITIES` block describing
    `CAPABILITY_SUGGESTION` / `LEARNED_SOURCE` structured suggestions
    (suggest-only, human-reviewed via `claude-action` Issues).
  - `agents/config/agents-config.json`: agents 5-11 (admin tier) now have
    `can_generate_assets: true`.
  - `agents/config/asset-platforms.json`: new reference list (base64
    tooling, Stitch, Google AI Studio).
  - `agents/config/year-tracker.json`: new `asset_pipeline` section
    (`generated -> tested -> optimized -> implemented`) + `stats.total_assets_by_stage`.
  - `CLAUDE.md`: added "Launch Decisions (authoritative)", "Source
    Validation (very high)", and "AI Capabilities — Self-Extension &
    Self-Education" sections; updated agents 5-11 description (Gemini
    2.5 Flash-Lite) and Infrastructure Costs.
- **Part 1 — UI changes to `index.html`**: DONE, not yet committed.
  - 1.4 Brightness/contrast pass on `:root` ("Terminal aesthetic v2.2"):
    `--bg`, `--surface`, `--surface2`, `--surface3`, `--border`,
    `--border2`, `--text`, `--text-muted`, `--text-dim` all lifted a step;
    accents unchanged.
  - 1.1 Bigger AI chat: `#ai-tab-container` height
    `calc(100vh - 160px)` / `min-height: 560px` (was `-230px`/420px;
    mobile `-130px`/480px, was `-200px`); `#ai-input` max-height 160px
    (was 96px) with larger font/padding; `#ai-send-btn`/`#ai-lang-toggle`
    bumped to 46px.
  - 1.3 CLI Mode terminal look: `#ai-tab-container.cli-active` (toggled by
    `updateAiModeCheckboxes()` via `isCliModeActive()`) gives the chat
    area/input a black-green terminal palette, `C:\>` prompt prefixes via
    `::before`, and a green caret.
  - 1.2 Solve a Case controls: new `#diagnose-controls` block (platform +
    severity chips via `selectDiagnoseChip()`, action buttons — Start
    diagnosis / Next step / Mark resolved / Escalate / Need a guide — via
    `diagnoseAction()`), shown only when `isAiModeActive('diagnose')`. New
    bilingual `AI_STRINGS` entries added.
  - Verified: `node --check` on the extracted `<script>` block passes,
    `node .github/scripts/validate-json.js` passes (data files untouched).
    Not yet verified in a real browser — do a quick `python -m http.server
    8080` smoke check (desktop + 375px) before/after committing if possible.
- **Part 3 — deploy + smoke test**: BLOCKED, see "NEW BLOCKER" above. Not
  started — no D1 check, no secrets check, no `wrangler deploy`, no smoke
  test yet.

**Next session**: (1) get Cloudflare auth working (user provides a real
`CLOUDFLARE_API_TOKEN` or runs `wrangler login`), (2) run Part 3 exactly per
`OFFICE-PROJECT-BRIEF.txt` section 5 — D1 schema check/apply, confirm
`GEMINI_API_KEY`/`ADMIN_TOKEN` secrets on `data-center-agents` (ask user for
values, don't invent), `npx wrangler deploy` from `agents/`, smoke test
`/api/agents/status` (expect 11 agents, no 500s) — **no cron triggers, no
simulation start**, (3) once deploy is verified: item 4 above (single-agent
test against the live app), then the full quarter launch.

## Notes

- Each session should aim to stay within roughly 5,500 tokens of work
  before committing and pausing for review.
- Per `CLAUDE.md`'s Autonomous Brain Rules: commit locally, summarize what
  changed, and wait for explicit confirmation before `git push` to
  `master`.
