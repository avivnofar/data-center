# Agent Specification Reference (Summary)

> **DRAFT — not final.** This is a summary of `config/agents-config.json` and
> the shared mechanics in `agents/agent-base.js`, kept in sync as the agent
> spec evolves. For exact values (thresholds, rates, prompt text) always
> read `config/agents-config.json` directly — this file is documentation,
> not a source of truth.

---

## Shared state machine (`AgentBase`)

Every agent (1-11) carries:

| Field | Range | Meaning |
|-------|-------|---------|
| `mood` | 0-100 | General disposition. Starts at 50. Drives `HAPPY`/`IRRITATED` trigger chances and (Agent 3) `model_usage_rate`. |
| `irritation` | 0-5 | Stack of unresolved frustrations. `addIrritiation()` increments; `resolveIrritation()` decrements. Hitting an agent's `irritation_stack.angry_threshold` (default 5) triggers `ANGRY`. |
| `isHappy` / `isAngry` | bool | Current state flags. `triggerHappy()` raises mood +10. `triggerAngry()` files an incident report and ends the session. |
| `isPanic` / `panicLevel` | bool / 0-100 | **Trainee (Agent 4) only** — see Escalation Protocol below. Harmless on other agents. |
| `permanentIrritationFlags` | string[] | Survive `resetWeeklyState()` — e.g. Agent 2's `slow_ui` / `sloppy_design` flags persist until the underlying issue is fixed. |
| `session` | object\|null | Current `agent_sessions` row: `cases_handled`, `mood_start`/`mood_end`, `irritation_events`, `happy_events`, `extended_session`. |

### Session lifecycle

1. `startSession(caseData, mode)` — opens an `agent_sessions` row.
2. Per case: `interactWithApp(query, mode)` → `data-center-api`'s `/api/chat`
   → `evaluateResponseQuality()` (placeholder heuristic) → possible
   `triggerHappy()` / `addIrritiation()` → `logInteraction()`.
3. `extendSession()` — applies `session_extension_multiplier` when an
   agent's `extended_session_chance` roll succeeds (typically after `HAPPY`).
4. `endSession()` — closes the `agent_sessions` row with final mood/counters.

### Weekly reset (`resetWeeklyState()`)

Run by `scheduler.js`'s `runWeeklyResetCycle()`:

- `mood` regresses toward the mean: `mood = round((mood + 50) / 2)`.
- `irritation` and `isAngry` clear **unless** `permanentIrritationFlags` is
  non-empty.
- `isHappy` clears.
- A weekly report is filed (`fileWeeklyReport()`) before the reset.
- Agent 2's `checkWeeklyBonus()` runs if defined.

---

## Phase 1 agents

### Agent 1 — The Perfectionist (QA Lead, standard)

- `model_usage_rate: 0.30` (advanced-difficulty cases always use the app).
- `extended_session_chance: 0.60`, `session_extension_multiplier: 1.50`.
- **Never enters `ANGRY`** — believes in "educating the algorithm" instead.
- `IRRITATED` (30% @ quality < 0.4): generates critical feedback via Gemini,
  demands a corrected response, rates it 1-10.
- `CALM`/`NEUTRAL` only re-entered once a case is solved **and**
  documentation/PDF exists for it.
- `HAPPY` (50% @ quality > 0.7): may `extendSession()`, drift to a related
  topic, and `fileSuggestion()` recommending a bookmark.

### Agent 2 — The Productive (Senior IT Operator, standard)

- `model_usage_rate: 0.40`, `extended_session_chance: 0.30`.
- `irritation_stack`: max 3, `bad_answer_chance: 0.45`,
  `permanent_flags: ["slow_ui", "sloppy_design"]`, `angry_threshold: 3`.
- `IRRITATED`: 45% chance on a bad answer, **or permanently** while
  `slow_ui`/`sloppy_design` flags are set (until fixed) — mocks the AI,
  reduces `patience_meter`.
- `ANGRY` (irritation stack ≥ 3 without an intervening `HAPPY`):
  `fileIncidentReport()`, ends all sessions, sets a cooldown.
- `work_routine.overtime: "30%_of_days"` — 30% of days extend the session.
- Weekly bonus day (+30% over quota): one extended session focused on
  app/Claude optimization suggestions.
- "Found-outside" pattern: while `IRRITATED`, if the simulated external
  search succeeds, files a `fileSuggestion()` "mock report" showing how easy
  the external answer was.

### Agent 3 — The Standard Agent (IT Generalist, standard)

- **Mood-proportional usage**: `model_usage_rate = mood / 100`, recalculated
  at the start of every session (`mood_proportional_usage`).
- `IRRITATED` is a **100% trigger** on `critical_error_detected`.
- After every session where the UI worked correctly: files a balanced
  `status_report` via `fileStatusReport()` with `ui_score`,
  `resource_access_score`, `response_quality_score`,
  `user_friendliness_score`, `overall_happiness_level`,
  `specific_observations` (1-10 scales). Reports must stay professional —
  "no exaggeration in either direction."

### Agent 4 — The Trainee (Junior IT Support, standard)

- `model_usage_rate: 0.55`, `patience_meter: 30`.
- Asks multiple clarifying questions per case, favors `'diagnose'` mode.
- **Guide detection** (before each case): checks
  `data-center-archive/guides/` for a relevant guide.
  - Found → `triggerHappy()` immediately.
  - Not found → higher chance of `panicLevel` accumulation.
- `HAPPY` (45% @ quality > 0.7 OR guide found): productivity increases
  significantly, `panicLevel` decreases.

#### Escalation Protocol (`TRAINEE_PANIC`)

Triggered when `panicLevel >= 80`:

1. Set `panicActive = true` (`isPanic = true`).
2. Select a helper: QA/Perfectionist (Agent 1) — 70% combined
   (40% + 30% per spec), or a random active agent — 30%.
3. Fire `TRAINEE_PANIC` event `{ traineeId, selectedAgent, caseData }`.
4. `scheduler.js`'s `handleTraineePanic()` runs a joint session: the helper
   agent + the live app collaborate on the trainee's case.
5. Check `data-center-archive/guides/` for an existing guide for this case
   type.
6. If none exists, generate one via Gemini and save as markdown.
7. Commit the new guide to `data-center-archive/guides/` (Phase 2 —
   `commitGuideToArchive()`, requires `GITHUB_TOKEN`; no-ops without it).
8. Reset `panicLevel` to 0; mood improves.

---

## Phase 2 stub agents (5-11)

All use `agent-stub.js`, which extends `AgentBase` with no behavioral
overrides — they exist so the `agents` table, permission tiers, and
dashboard grid are complete, and so `instantiateAgent()` never throws for an
unknown id.

| # | Name | Tier | Clearance |
|---|------|------|-----------|
| 5 | The Specialist (Network & Security) | worker | standard |
| 6 | The Senior Sysadmin | lead | sudo |
| 7 | The Security Auditor | lead | sudo |
| 8 | The DevOps Engineer | lead | sudo |
| 9 | The Helpdesk Coordinator | worker | standard |
| 10 | The IT Director | management | root |
| 11 | The CTO | management | root |

When the full spec is finalized, give each a `states`, `behavioral_rules`,
and `system_prompt_additions` block following the Phase 1 agents' shape, add
a dedicated `agent-N-*.js` class, and register it in
`agent-runner.js`'s `AGENT_CLASSES`.

---

## Permission tiers (`fileSuggestion()` routing)

From `config/simulation-config.json`'s `PERMISSIONS` block:

- **root**: agents 10, 11 — `fileSuggestion(content, true)` always routes to
  `root` regardless of caller.
- **sudo**: agents 6, 7, 8.
- **standard**: agents 1, 2, 3, 4, 5, 9.

`suggestions.permission_level` defaults to the filing agent's `clearance`
unless `isRoot=true` is passed (used for escalated/strategic suggestions).

---

## Open questions for the next spec revision

- Exact behavioral rules, state machines, and `system_prompt_additions` for
  agents 5-11.
- Formula for `weekly_analytics.irritation_count` / `happy_count` /
  `overtime_days` / `suggestions_filed` (currently not computed —
  `agents/README.md` "Known gaps").
- Whether `evaluateResponseQuality()` should call Gemini-as-judge in Phase 2,
  and what prompt/rubric to use.
