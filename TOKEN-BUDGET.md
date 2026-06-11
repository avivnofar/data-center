# Token Budget — Session Queue

Tracks the next planned Claude Code sessions for this project and their
rough scope, so each session can pick up the next item without re-deriving
priorities. See `CLAUDE.md`'s "Current Strategy (authoritative)" section and
`agents/STRATEGY.md` for the framing behind this order.

## Queue

0. **Month-1 launch run** — STOPPED by owner request at the end of Day 1
   (2026-06-11). See "Launch attempt" section below and
   `agents/reports/week-01-report.md` for the Week 1 report covering the
   partial Day 1 data. `SIM_KV.paused = true` was set as the explicit stop
   signal. Blocked on Gemini API quota/billing — needs user action before
   retry. Resume here once unblocked.

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
4. **Test the single Gemini agent against the live app** — DONE. See
   "Launch session progress (continued)" below.
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

### Docs cleanup while Part 3 is blocked

While blocked on Cloudflare auth, fixed the staleness CLAUDE.md flagged in
`agents/README.md`/`agents/AGENTS.md` (old two-Worker design, wrong agent
5-11 names): both now describe the consolidated `agent-runner.js` Worker
and the correct agents-config.json v0.2.0 roster (IT Chief, QA, Team Lead,
Lead QA, Designer, Architect, CEO). Also fixed `agent-reports.yml` /
`generate-weekly-report.mjs`, which still pointed at a `/run/week` endpoint
on a separate `AGENTS_SCHEDULER_BASE` scheduler Worker that no longer
exists — now call `agent-runner.js`'s `/api/agents/trigger
{"type":"week_reset"}`. And aligned `simulation-config.json`'s
`PERMISSIONS` block with each agent's actual `clearance`. Two commits, not
yet pushed — pending review per the pause-before-push rule.

## Launch session progress (continued, 2026-06-11)

Cloudflare auth blocker RESOLVED (`wrangler whoami` now authenticated). Steps
0-5 of `OFFICE-PROJECT-BRIEF.txt` section 5 are now done:

- **Step 1 (D1 schema/seed)**: schema tables already existed; `agents` and
  `cases` tables were empty. Applied `agents/database/seed-cases.sql`
  (11 agents + 12 sample cases) — first time, safe (was empty).
- **Step 2 (secrets)**: `GEMINI_API_KEY` and `ADMIN_TOKEN` were already set
  on `data-center-agents` from an earlier deploy. Rotated `ADMIN_TOKEN` to a
  new value (given to the user out-of-band for the in-app Admin tab's
  `dc-admin-token`; not stored in this repo).
- **Step 3 (deploy)**: Worker was already deployed (2026-06-11T14:01 UTC).
- **Step 4 (smoke test)**: `GET /api/agents/status` with `X-Admin-Token`
  returns `200` with all 11 agents (ids 1-11), correct names from
  `agents-config.json` v0.2.0, mood/irritation/status fields present.
- **Step 5 (single-agent test)**: ran `POST /api/agents/run` for agent 3
  (Standard Agent, Phase 1 dedicated class) and agent 6 (QA, Phase 2
  `agent-stub.js`), each against a real seeded case.
  - **Found and fixed a real bug**: the first attempt for both agents
    returned `{"ok":false, "response":"error code: 1042"}` —
    Cloudflare blocks a Worker from `fetch()`-ing another Worker's
    `*.workers.dev` URL directly. `interactWithApp()` in
    `agents/agents/agent-base.js` was calling
    `https://data-center-api.avivnofar.workers.dev/api/chat` via plain
    `fetch()`. Fixed by adding a service binding (`agents/wrangler.toml`:
    `[[services]] binding = "APP_API" service = "data-center-api"`) and
    updating `interactWithApp()` to use `env.APP_API.fetch()` when present
    (falls back to plain `fetch()` for local dev). Redeployed
    `data-center-agents` (version `84f6c805`).
  - After the fix, both agents got real Claude responses (`ok:true,
    quality:1`) via the live app, and `agent_sessions`/`interactions` rows
    were written correctly to D1. Agent 3 also filed a Gemini-generated
    status report (`reports` table).
  - **Open question still unresolved** (per `AGENTS.md`): agent 6's run
    confirms `agent-stub.js` mechanically works (session/interaction
    recording, config-driven app-usage rate, real app responses) for a
    Phase-2 "specified" agent, but it doesn't produce the
    persona-specific Gemini reports/state transitions that Phase-1 agents
    (1-4) do. Whether that's "good enough" for launch or needs Phase-1-style
    state machines for 5-11 is still an open decision.
- Test runs left 4 rows in `agent_sessions`/`interactions` (2 from the
  pre-fix 1042 failures, 2 from the post-fix successes) and 1 row in
  `reports` — harmless test data, not cleaned up.

**Not yet done**: Step 6 (index.html `AGENTS_SCHEDULER_BASE` cleanup — grep
usages first, per the brief), Step 7 (cron triggers — needs explicit user
sign-off, starts real recurring cost), Step 8 (doc/code gaps:
`evaluateResponseQuality()`/`getDbContext()` placeholders, missing
`weekly_analytics` population, no `POST /api/agents/reports/:id/ack`
endpoint).

## Pre-launch readiness check (2026-06-11, no simulation run)

Per request, audited readiness for the office simulation WITHOUT triggering
`runWorkDayCycle`/`runWeeklyResetCycle` (those make ~50 Gemini calls +
many Claude calls per simulated day — explicitly not run this session).

- **Step 6 done**: `AGENTS_SCHEDULER_BASE` in `index.html` CONFIG was
  confirmed dead (grep showed only `AGENTS_API_BASE` is used at lines
  3263/3272/3375) — removed the unused key.
- **Static checks, all clean**: `node --check` on every file in
  `agents/workers/*.js` and `agents/agents/*.js` (no syntax errors);
  module resolution already proven by the successful `wrangler deploy`
  (esbuild would fail on missing imports/exports); SQL column names in
  `meeting-engine.js` cross-checked against `schema.sql` — all match.
- **CRM case generation is safe to run**: `crm-engine.js` IDs
  (`crm-<year>-w<week>-d<day>-<n>`) can't collide with seeded `case-XXXX`
  rows, and `persistCrmCases()` uses `INSERT OR IGNORE`.
- **Empty `year_stats`/`SIM_KV` are handled gracefully**: `getYearState()`
  seeds from `year-tracker.json` if no row exists; `getSimulationState()`
  defaults to `paused: false` if `SIM_KV` is empty (current actual state).
- **`GITHUB_TOKEN` absence is a clean no-op** everywhere it's checked
  (`agent-runner.js`, `meeting-engine.js`, `scheduler.js`).
- **Flagged, not fixed (design question, not a bug)**: `simulation-config.json`
  `TIME_SCALE.real_hours_per_work_week: 24` ("24h = 1 work week of 5 days")
  doesn't match the actual cron design in `agent-runner.js`'s `scheduled()` —
  hourly cron = 1 simulated day, daily cron = reset cycle covering the last
  24h via `getWeeklyCasesHandled()`'s hardcoded 24h lookback (i.e. ~24
  simulated days per "weekly" reset, not 5). `TIME_SCALE` isn't read by any
  code (only referenced in a comment), so this is harmless today but worth
  reconciling — pick the real intended cadence — before finalizing the
  cron strings in Step 7.

**Verdict**: code is ready for a manual `runWorkDayCycle` test (or Step 7
cron) from an infra/correctness standpoint. The cron-cadence question above
and the agent-stub.js "good enough for 5-11" open question (Step 5) are the
two remaining product decisions before Step 7.

## Launch attempt — Month 1, Day 1 (2026-06-11)

Per the project owner's launch prompt, ran preflight (all green: D1 schema
complete, `data-center-agents` deployed at version `84f6c805` with the
service-binding fix, `GEMINI_API_KEY`/`ADMIN_TOKEN` secrets present, models
correct). **`ADMIN_TOKEN` was rotated** this session (new value given to the
user directly in chat — update `dc-admin-token` in the dashboard).

Triggered `POST /api/agents/trigger {"type":"day"}` as a smoke test (this
code path — `runWorkDayCycle()` — had never run end-to-end before). Result:
**HTTP 500 after 449s** — `Gemini API error (429): "You exceeded your
current quota, please check your plan and billing details"`.

- **Root cause**: `GEMINI_API_KEY`'s Google AI Studio project hit a 429
  quota/billing limit on `gemini-2.5-flash-lite` partway through day 1's
  case loop (47 of 50 cases processed). `gemini-client.js` has no
  retry/backoff, so the first 429 became a 500. CLAUDE.md assumes a "paid"
  Gemini tier — this key appears to be on free-tier limits, or the daily
  free quota was already partly used by prior testing sessions.
- **Cost**: negligible. Gemini calls cost $0 (free tier). 26 real Claude
  (`data-center-api`) calls succeeded (25 search + 1 diagnose) — estimated
  ~$0.10-0.50 total. Nowhere near the $5 cap.
- **Partial D1 state for day 1** (crm-2026-w01-d1-001..050): 50 cases
  persisted, 47 `agent_sessions`, 26 `interactions`, 10 status reports
  (agent 3). `year_stats` has 0 rows — day 1 never officially completed.
  Full diagnostic snapshot: `agents/checkpoints/month-01/day-01-attempt.json`.
- **Before retrying day 1**: (1) resolve the Gemini quota/billing issue —
  check https://aistudio.google.com billing for this key's project; (2)
  decide whether to clean up the 47 partial day-1 sessions/interactions/
  reports (crm-2026-w01-d1-*) before a clean retry, since `runWorkDayCycle`
  has no "already processed today" guard and would reprocess all 50 cases
  on a second attempt; (3) consider adding retry/backoff to
  `gemini-client.js` before the next attempt (not done this session — no
  behavior changes during the run, per CLAUDE.md).

**Per the HARD RULES** ("HALT only if unfixable after retries, or cost cap
hit"), this halted the run — the quota/billing issue is unfixable from
within this session. Days 2-20 and month-end were not attempted.

**Owner instruction (same session)**: stop the experiment at the end of
Day 1 and write a report on the first week/period. Done — set
`SIM_KV.paused = true` via `POST /api/simulation`, wrote
`agents/reports/week-01-report.md` (public/private/special tiers covering
the 47/50-case partial Day 1), and removed the temporary `agents/_day1_*.json`
scratch files used to gather the report data.

## Notes

- Each session should aim to stay within roughly 5,500 tokens of work
  before committing and pausing for review.
- Per `CLAUDE.md`'s Autonomous Brain Rules: commit locally, summarize what
  changed, and wait for explicit confirmation before `git push` to
  `master`.
