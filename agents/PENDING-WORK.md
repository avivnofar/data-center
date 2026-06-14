# Pending Work — Session Log

This file tracks what an autonomous session intended to do, what it
finished, and what remains for the next automated session (02:30 / 07:30
Israel time) or a human/Claude-Code session to pick up.

---

## Session 2026-06-14 (evening) — UI overhaul + asset pipeline

### Plan for this session

**Priority 1 — Critical UI fixes (index.html)**
1. Restore three AI mode buttons (Free Search / Solve a Case / CLI Mode) as
   mutually-exclusive radio-style buttons above the AI input bar, with
   `localStorage['dc-ai-mode']` persistence, Solve-a-Case action
   buttons/severity/platform chips, and CLI Mode rendering Terminal Academy
   (`tools/commandflow/commandflow-core.js`) inline in chat.
2. Left sidebar navigation (200px, collapsible to icons, mobile hamburger
   overlay, auto-collapse while chatting) replacing the horizontal tab bar.
3. Claude chat dominates the screen (~80vh conversation area, 52px input
   bar, FAQ pills only when conversation empty, mode selector always
   visible, sidebar auto-collapses when chat is active).

**Hebrew/English RTL audit** — scan `index.html` for Hebrew text containing
English terms not wrapped in `<span dir="ltr">`/`.ltr-term`, code blocks
missing `dir="ltr"`, and punctuation issues; fix all found.

**Priority 2 — New features (time/token permitting)**
- Feature A (runbook integration): extract Terminal Demo, Incident
  Timeline, and Metrics Dashboard logic from
  `agents/assets/incoming/datacenter-runbook-optimized/datacenter-export/dist/public/assets/`
  into vanilla-JS modules under `tools/runbook/`, wire Terminal Demo's
  command library into `commandflow-core.js`, Incident Timeline into
  "Solve a Case" mode, Metrics Dashboard into the admin/Office tab. Add a
  `runbook` board entry (status `in-progress`, owners agent-9/agent-10,
  priority `week`).
- Feature B (DB integration): read
  `agents/assets/incoming/database-integration-complete/database-integration-complete/{templates,QUICKSTART.md}`,
  do **not** implement — write an implementation plan here, add a
  `database-integration` board entry (status `planned`, owner agent-10,
  estimated `this-week`).

**Office automation config** — update
`agents/config/simulation-config.json` so tomorrow's office day is
cases-only (agent_9/agent_10 feature work only after cases + token allow),
`new_features_policy: BLOCKED` for everyone else, `model_training_priority:
HIGH`.

**Commit sequence** — Priority 1 UI first (so it lands even if the session
runs out of token before Priority 2), then PENDING-WORK + config, then
board.json, then any `tools/runbook/` extraction, then `git pull --rebase &&
git push`.

### Feature B — Database Integration Implementation Plan (NOT implemented this session)

Source materials reviewed:
`agents/assets/incoming/database-integration-complete/database-integration-complete/{templates/schema-template.ts, templates/db-helpers-template.ts, QUICKSTART.md}`.

**Finding**: these templates target a different stack — Drizzle ORM +
MySQL + tRPC + a `webdev_add_feature` codegen tool. They are **not directly
portable** to this project's Cloudflare D1 (raw SQLite via
`env.DB.prepare(...).bind(...).run()/.first()/.all()`) + vanilla-Worker
stack. `agents/database/schema.sql` already defines all needed tables
(`agents`, `agent_sessions`, `cases`, `interactions`, `reports`,
`suggestions`, `weekly_analytics`, `meetings`, `side_plots`, `promotions`,
`year_stats`) — **do not adopt Drizzle, MySQL, or any build step.**

**Adoptable pattern** (from `db-helpers-template.ts`'s shape, not its code):
a single `agents/workers/db-helpers.js` module with one small CRUD helper
per table, each:
- lazily accesses `env.DB` (the D1 binding) — no module-level connection state
- wraps `env.DB.prepare(sql).bind(...).run()/.first()/.all()`
- returns `undefined`/`null`/`[]` gracefully if `env.DB` is missing (mirrors
  the template's "tooling can run without a DB" guard)

**Proposed helper functions** (one file, ~1 session for agent-10):
- `getAgent(env, id)`, `listAgents(env)`
- `upsertAgentSession(env, session)`, `endAgentSession(env, id, fields)`
- `createCase(env, caseRow)`, `getCase(env, id)`, `listOpenCases(env, agentId)`, `resolveCase(env, id, fields)`
- `logInteraction(env, interaction)`
- `fileReport(env, report)`, `listReports(env, {permission, agentId})`
- `recordWeeklyAnalytics(env, row)`
- Leave `getYearState`/`persistYearState` where they already live in
  `agent-runner.js` for now (per `schema.sql`'s comment) — migrate last,
  after the pattern is proven on a lower-risk table.

**Why not implemented now**: `agent-runner.js` and friends already call D1
directly at many sites; introducing a helper layer means auditing and
refactoring every call site, which is multi-file and multi-session.
Token-budget instruction was: plan only, no implementation.

**Next steps for agent-10 (this week, board item `database-integration`)**:
1. Grep `agents/workers/*.js` for every `env.DB.prepare(` call site and group by table.
2. Create `agents/workers/db-helpers.js`, starting with the highest-traffic
   table (`cases` or `interactions`).
3. Refactor one call site at a time; smoke-test via
   `/api/agents/trigger {"type":"day"}` (paused-sim safe); commit per table.
4. Repeat for remaining tables; migrate `getYearState`/`persistYearState` last.
5. Stay on raw D1/SQLite + vanilla JS — no Drizzle/MySQL/bundler.

---

### Feature A — Runbook Integration Status (this session)

Done:
- `tools/runbook/terminal-demo.js` — vanilla-JS port of `TerminalDemo.tsx`
  (`RunbookTerminalDemo.mount(container, opts)`), same 3-command demo script
  (`ping -c 4 192.168.1.1`, `systemctl status nginx`, `df -h /var/log`).
- `tools/runbook/incident-timeline.js` — vanilla-JS port of
  `TimelineDemo.tsx` (`RunbookIncidentTimeline.render(container, steps, opts)`),
  expandable event list + `addStep()`/`setStatus()` API for live updates.
- `tools/runbook/metrics-dashboard.js` — vanilla-JS port of
  `MetricsDashboard.tsx` (`RunbookMetrics.mount(container, opts)`), animated
  count-up cards + stats strip.
- `tools/commandflow/commands.json` — merged the Terminal Demo's 3 exact
  commands into the `bash` platform (`ping -c 4 192.168.1.1`,
  `systemctl status nginx`, `df -h /var/log`) for more realistic CLI Mode output.

Not done (remaining for agent-9/agent-10, board item `runbook`):
- Wire `incident-timeline.js` into "Solve a Case" mode in `index.html`
  (`#diagnose-controls` flow) so each action button
  (התחל אבחון/שלב הבא/סמן כפתור/הסלמה/צריך מדריך) appends a timeline step
  via `RunbookIncidentTimeline.render()`/`addStep()`.
- Wire `metrics-dashboard.js` into the admin/Office tab
  (`buildAdminPanelShell()`/`renderAdminPanel()`).
- Add `<script src="tools/runbook/*.js">` tags to `index.html` once wired.

---

### Status — filled in at end of session

**Priority 1 (UI fixes): DONE.**
- 3 AI mode radio buttons, "Solve a Case" action buttons/chips, and CLI Mode
  (Terminal Academy via CommandFlow) were already implemented in an earlier
  session today (commit a92d87c) — verified present, no changes needed.
- Left sidebar navigation (200px, collapsible, mobile hamburger overlay,
  auto-collapse while chatting) was newly implemented and committed
  (4463a77 / 4463a77 rebased to 4463a77).
- Full-screen chat layout (~80vh, FAQ pills hidden during conversation) was
  already implemented today — verified present, no changes needed.

**Hebrew/English RTL audit: 1 issue found and fixed.**
- Office-lock-modal Hebrew text had a bare "AI" not wrapped in
  `.ltr-term` — fixed. All other flagged strings render via `.textContent`
  or `escHtml()`, so no further changes were needed.

**Priority 2 — Feature A (runbook integration): PARTIAL.**
- Done: `tools/runbook/{terminal-demo.js, incident-timeline.js,
  metrics-dashboard.js}` created as dependency-free vanilla-JS modules;
  `tools/commandflow/commands.json` gained the Terminal Demo's 3 commands
  (ping/systemctl/df) for richer CLI Mode output. `runbook` board item added
  (in-progress, agent-9/agent-10, priority week).
- Remaining: wire `incident-timeline.js` into "Solve a Case" mode
  (`#diagnose-controls`) and `metrics-dashboard.js` into the admin/Office
  tab in `index.html` (add `<script>` tags + call sites). See "Feature A —
  Runbook Integration Status" above for exact hook points.

**Priority 2 — Feature B (DB integration): PLANNED, not implemented (per
instruction).**
- Implementation plan written above ("Feature B — Database Integration
  Implementation Plan"). `database-integration` board item added (planned,
  agent-10, estimated this-week). Templates use Drizzle/MySQL — explicitly
  NOT to be adopted; plan instead proposes a `agents/workers/db-helpers.js`
  CRUD-helper layer over the existing D1 `schema.sql`.

**Office automation**: `agents/config/simulation-config.json` updated —
`tomorrow_focus: cases_only`, agent_9/agent_10 feature-work exceptions only
after cases + token allow, `new_features_policy: BLOCKED` elsewhere,
`model_training_priority: HIGH`.

**Commits pushed this session** (after rebase onto origin/master):
4463a77 (sidebar nav + RTL fix), 65ffdf2 (PENDING-WORK + sim config),
1a83e86 (board.json runbook/db entries), 8e37cc3 (tools/runbook/ +
commandflow commands.json).

**For the next automated session (02:30/07:30 Israel time)**:
1. If token budget allows and tomorrow's cases are done early: wire
   `tools/runbook/incident-timeline.js` into "Solve a Case" mode (agent-9 +
   agent-10, per `runbook` board item).
2. agent-10: start the DB-integration helper layer per the plan above —
   one table at a time, starting with `cases` or `interactions`.
3. No other Priority 1/2 items remain outstanding from this session.
