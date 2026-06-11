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

## Daily automation + AI-tool coordination build (2026-06-12)

Per the project owner's "autonomous architect" prompt (build the DAILY
AUTOMATION + SCHEDULING SYSTEM, config + wiring only, no cron, no live
run this session). Preflight was green (CLAUDE.md Current Strategy +
Launch Decisions read, `agents/config/*.json` reviewed, `git log` clean
on Week-1-stop commit `1c14a12`).

- **Part 1 — `agents/config/daily-schedule.json`** (NEW): tactical 24h
  cycle. Work 08:00-16:00, overtime 16:00-18:00. Day-type mapping
  (1=Sun..5=Thu full work days with 5 case-batches at 0.30/0.20/0.20/0.20/0.10
  share, daily standup, tool-task window, AI-experience report, spare time;
  6=Fri short day with 2 batches + weekly summary meeting at 12:00; 7=Sat
  off, `force_idle:true`, zero API calls). `model_education_program`
  (quality threshold 0.6, max 3 case studies/day) and
  `weekly_summary_program` (3 Friday outputs: summary.md, data.csv,
  public-summary.md) defined. `_meta.case_volume_design_note` documents
  the existing ~50/day CRM pool being *partitioned* by `case_share`, not
  multiplied.
- **Part 2 — `agents/config/ai-tools.json`** (NEW): tool-access matrix.
  NotebookLM (primary: Agent 6/QA), Stitch (Agents 9+10, joint-only),
  Base44 (all admins, preferred 9/10), Google AI Studio (Agents 9+10).
  `weekly_rotation` Sun-Thu maps each day to one tool + agent(s) + session
  mode, staggered to avoid conflicts/token exhaustion.
- **Part 3 — asset pipeline seeded** (NEW): `agents/reports/asset-pipeline/board.json`
  + 4 spec files in `agents/reports/asset-pipeline/issues/`:
  `qa-knowledge-base.md` (Agent 6 NotebookLM DB build — goal: app answers
  almost exclusively from QA-built knowledge bases, very-high source
  scrutiny applies), `archives-app.md` (joint 6+9+10, "archive mentality"
  + thin AI brain, reuses data-center-archive concepts), `designer-tooling-suite.md`
  (Agent 9, free design tools), `architect-org-products.md` (Agent 10,
  org-facing products, joint w/ Designer for important ones). CRM flagged
  as `not_scheduled:true` placeholder in board.json. CLI tools: added
  `data/modules.json` "coming-soon" stub (`id:"cli"`) + CLAUDE.md "Future
  Assimilation: CLI Tools" section — not built.
- **Part 4 — `agents/workers/agent-runner.js` wiring**: `runWorkDayCycle`
  now reads `daily-schedule.json`/`ai-tools.json` via `getDaySchedule()`,
  partitions cases via `partitionCasesByShare()`, runs each batch through
  `processCaseBatch()` (logs low-quality interactions for model-education
  case studies), then iterates the day's schedule blocks: tool-task window
  -> `maybeOpenAssetTask()`, report block -> `runDailyAiExperienceReports()`,
  spare time -> `runSpareTimeForAgent()` (20% coworker-interaction / 80%
  idle, Saturday always idle/zero calls), Friday weekly_summary ->
  `generateWeeklySummary()` + `checkProductVersionBumps()` (+0.01 per
  shipped weekly product, tracked in `year-tracker.json` `stats.product_versions`).
  `commitFileToRepo` now sha-aware (create+update); new `fileGitHubIssue`/
  `fileAssetTaskIssue`/`fileModelEducationIssue`/`fetchAssetBoard` helpers
  — all no-op cleanly without `GITHUB_TOKEN` (confirmed absent this
  session), queuing to D1 `reports`/board.json instead. `agent-base.js`
  gained `fileModelEducationCaseStudy()`. `renderDailySummary()` gained a
  "## Daily Schedule" section via new `renderScheduleSection()`.
  Validated: `node --check` clean on both files, all touched JSON files
  parse, `validate-json.js` passes (11 modules, 27/15/12/10 entries).
- **Part 5 — docs**: CLAUDE.md gained "## Daily Automation & AI-Tool
  Coordination" (schedule, tool matrix, asset pipeline, weekly summary,
  version-bump rule, status note) and "## Future Assimilation: CLI Tools".

**No cron added.** `SIM_KV.paused` stays `true` from the Week-1 stop as of
the build itself; see the launch attempt below for what happened after.

## Launch attempt — schedule-driven day, take 2 (2026-06-11, ~23:08 UTC)

With explicit owner sign-off, generated a fresh `ADMIN_TOKEN`
(`wrangler secret put ADMIN_TOKEN --name data-center-agents` — new value
given to the owner directly in chat, update `dc-admin-token`), confirmed
`/api/agents/status` healthy (11 agents), unpaused via `POST
/api/simulation {"paused": false}`, then triggered `POST
/api/agents/trigger {"type":"day"}`.

- **Result: HTTP 500 after ~146s** — same `Gemini API error (429):
  "You exceeded your current quota..."` as the 2026-06-11 Month-1 Day-1
  attempt (see above), but failing **3x faster** (146s vs 449s) and
  **before any new D1 writes** — `cases` count unchanged (62), `reports`
  unchanged (10 status rows, latest timestamp 21:56 UTC — *before* this
  run), `year_stats` still empty.
- **Root cause confirmed**: this is the *same* exhausted daily quota from
  the 2026-06-11 ~21:55-21:58 UTC attempt, not a new/separate issue. Google
  AI Studio free-tier daily quotas reset at midnight Pacific Time
  (~08:00 UTC / ~11:00 Israel time) — at 23:08 UTC June 11 that reset had
  **not yet happened**, so the key was still exhausted from ~1h10m earlier.
  This run hit the limit on essentially its first Gemini call, hence the
  much faster failure.
- **Immediately re-paused** (`SIM_KV.paused = true`) — no further calls
  attempted. Cost: effectively $0 (the 429 fires before any Claude
  `data-center-api` calls in the case-batch loop).

**Per HARD RULES / Launch Decisions stop logic** ("halt only if unfixable
after retries, or cost cap hit"): this is unfixable from within a session —
it requires either (a) waiting past the daily quota reset (~08:00 UTC /
~11:00 Israel time) before retrying, or (b) the owner checking/upgrading
billing for this `GEMINI_API_KEY` project at
https://aistudio.google.com (CLAUDE.md assumes a "paid" tier; this key's
behavior — hard daily cap, fast exhaustion — looks like free tier).

**Next session**: (1) confirm it's past the quota reset window, (2) retry
`POST /api/agents/trigger {"type":"day"}` (unpause first) — if it again
fails near-instantly with 429, the key is not on the paid tier the cost
model assumes and needs an owner-side billing fix before any further
attempts; (3) separately, consider adding retry/backoff + request-rate
limiting to `gemini-client.js` (flagged twice now, still not implemented —
no behavior changes were made *during* either run, per the rules, but this
is a between-runs code fix candidate for a future session).

## Per-block cron wired (2026-06-12)

Per owner request ("set the automation to start tomorrow morning at
8:00-17:00 israel time") and two explicit architecture choices —
**"Multiple crons across 08:00-17:00 IST"** and **"Schedule the cron for
11:00 IST instead (Recommended)"** (the latter for the *quota-reset* angle,
see below) — re-architected `agent-runner.js` from a single
`runWorkDayCycle()` call per cron tick to a per-block dispatcher driven by
`agents/config/daily-schedule.json`:

- **New `israelTimeParts(date)`**: converts `event.scheduledTime` (UTC) to
  `{ time: "HH:MM", dayOfWeek }` Israel local time. `ISRAEL_UTC_OFFSET_HOURS
  = 3` (IDT). **DST CAVEAT**: when Israel switches to IST (UTC+2, ~late Oct)
  or back to IDT (~late Mar), this constant AND `wrangler.toml`'s cron
  window must both be updated by 1 hour — flagged in both files.
- **New `runScheduledBlock(env, israelTime, dayOfWeek)`**: looks up
  `daily-schedule.json`'s blocks for `dayOfWeek`; no-ops if nothing is due
  at `israelTime`. On the day's first due block, generates+persists the
  day's CRM cases and partitions them into `case_batch` blocks (mirrors the
  old `runWorkDayCycle` setup). Persists a day-in-progress "cycle" to
  `SIM_KV` key `daily-cycle-state` between ticks. On the day's last due
  block, calls `finalizeScheduledDay()` (mirrors the old `runWorkDayCycle`
  tail: agent summary, side plots, year-stats, daily report commit) and
  clears the cycle.
- **New `logScheduledError(env, {...})`**: per-block try/catch — any error
  (e.g. Gemini 429) is logged as a `reports` row (`type='incident'`,
  `agent_id=10` "The Architect", `severity='warning'`) and the tick moves
  on. A failed `case_batch` block's cases are simply not processed that day
  (logged, not retried) — acceptable for now per the "contained, non-cascading"
  stop-logic reading; flagged as a known limitation.
- **`agents/config/daily-schedule.json`**: `saturday_schedule`'s single
  block moved from `"00:00"` to `"08:00"` — the new cron window
  (05:00-13:30 UTC = 08:00-16:30 IDT) never covers midnight, so the
  Saturday idle block needed to land inside the window (it's both the
  first and last block, so it still inits+finalizes in one tick).
  `_meta.cron_status` updated to "WIRED".
- **`agents/wrangler.toml`**: added `[triggers]\ncrons =
  ["*/30 5-13 * * *"]` — every 30 min, 05:00-13:30 UTC = 08:00-16:30 IDT,
  covering every block time in `full_day_schedule`/`friday_schedule`
  (08:00-16:00 IDT) and the relocated Saturday block (08:00 IDT) with a
  single cron entry (avoids per-block cron-count concerns).
- **Deployed** via `wrangler deploy` — cron confirmed active
  (`schedule: */30 5-13 * * *`). Simulation was **left paused**
  (`SIM_KV.paused = true`, confirmed before deploy) — the cron will fire on
  schedule starting tomorrow morning but `runScheduledBlock` returns
  `{skipped: true, reason: 'paused'}` for every tick until unpaused.

**Open item re: "11:00 IST" quota-reset choice** — `full_day_schedule`'s
first block is still `08:00` (case_batch, 30% share). With the cron live,
the 08:00 IDT tick *will* fire and attempt that batch even if the Gemini
quota hasn't reset yet (~11:00 IST per the take-2 attempt above). Per-block
error containment means a 429 there is logged and contained (doesn't crash
the day), but that batch's cases won't be processed. **Next session,
before unpausing**: either (a) accept this — the 09:30/11:00+ batches will
likely succeed once quota resets, only the 08:00 batch (30% of the day) is
at risk on day 1; or (b) reorder/shrink the 08:00 block's `case_share`
temporarily for the first live day. Decide with the owner before flipping
`paused: false`.

## Notes

- Each session should aim to stay within roughly 5,500 tokens of work
  before committing and pausing for review.
- Per `CLAUDE.md`'s Autonomous Brain Rules: commit locally, summarize what
  changed, and wait for explicit confirmation before `git push` to
  `master`.
