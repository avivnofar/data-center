/**
 * Data Center — AI Agent Simulation — agent runner Worker.
 *
 * Three responsibilities:
 *   1. `instantiateAgent()` / `runAgentSession()` — instantiate an agent
 *      (merging durable `configOverrides` from its Durable Object over the
 *      static agents-config.json entry via agent-base.js's loadState()) and
 *      run it against a single case.
 *   2. `runWorkDayCycle()` / `runWeeklyResetCycle()` — the simulation's
 *      cron-driven cycles: CRM case generation/assignment (crm-engine.js),
 *      per-agent behavioral loop, meeting-engine.js checks (daily standup,
 *      milestone reviews, audits, PIP sessions), side-plot lifecycle
 *      (side-plots.json), and year-tracker bookkeeping (year-tracker.json).
 *      Exposed via `scheduled()` for Cron Triggers and `/api/agents/trigger`
 *      for manual/admin runs.
 *   3. HTTP API for the Admin tab (agents/dashboard/) — read-only status,
 *      live session feed, reports, suggestions, year/side-plot state, and
 *      simulation controls, all backed by D1.
 *
 * Bindings expected (see agents/README.md):
 *   DB             - D1 database (schema.sql)
 *   AGENT_STATE    - Durable Object namespace (state-manager.js AgentStateDO)
 *   SIM_KV         - KV namespace for live simulation overrides
 *   GEMINI_API_KEY - secret
 *   GITHUB_TOKEN   - secret (optional; gates report/guide commits)
 *   ADMIN_TOKEN    - secret (validates X-Admin-Token on /api/agents/*)
 *
 * Status: DRAFT (Phase 1 foundation, Phase 2 office simulation).
 */

export { AgentStateDO } from './state-manager.js';

import agentsConfig from '../config/agents-config.json';
import simulationConfig from '../config/simulation-config.json';
import sidePlotsConfig from '../config/side-plots.json';
import yearTrackerSeed from '../config/year-tracker.json';

import { PerfectionistAgent } from '../agents/agent-1-perfectionist.js';
import { ProductiveAgent } from '../agents/agent-2-productive.js';
import { StandardAgent } from '../agents/agent-3-standard.js';
import { TraineeAgent } from '../agents/agent-4-trainee.js';
import { StubAgent } from '../agents/agent-stub.js';

import { runMeeting, MEETING_TYPES } from './meeting-engine.js';
import {
  generateAssignedDailyBatch,
  persistCrmCases,
  recordCompareAlternatives,
  getModelUsageAdjustment,
} from './crm-engine.js';

const ALLOWED_ORIGINS = ['https://avivnofar.github.io', 'http://localhost:3000', 'http://127.0.0.1:5500'];
const REPO_OWNER = 'avivnofar';
const REPO_NAME = 'data-center';
const ARCHIVE_REPO_NAME = 'data-center-archive';

/** Maps year-tracker.json milestone keys to the meeting they trigger (in
 * addition to the daily standup, which always runs). */
const MILESTONE_MEETINGS = {
  day_30: 'monthly',
  day_90: 'quarterly',
  day_180: 'semi_yearly',
  day_270: 'quarterly',
  day_365: 'yearly',
};

/** Phase 1 agents get full implementations; 5-11 use StubAgent (now driven
 * by their full agents-config.json specs — see agents/config _meta notes). */
export const AGENT_CLASSES = {
  1: PerfectionistAgent,
  2: ProductiveAgent,
  3: StandardAgent,
  4: TraineeAgent,
};

export function getAgentConfig(id) {
  return agentsConfig.agents.find((a) => a.id === id);
}

/**
 * Instantiates an agent. StubAgent-driven agents (5-11) whose
 * `model_usage_rate` in agents-config.json is a descriptive placeholder
 * (e.g. "optimized_dynamic", "uniquely_tailored_to_CEO_timeline") rather than
 * a number get a numeric runtime default of 0.5 so StubAgent's
 * `Math.random() < model_usage_rate` check works; the displayed config value
 * (and configOverrides, applied later via loadState()) are unaffected.
 */
export function instantiateAgent(id, env) {
  const config = getAgentConfig(id);
  if (!config) throw new Error(`Unknown agent id ${id}`);

  const AgentClass = AGENT_CLASSES[id] || StubAgent;
  const agentEnv = { ...env, SIM_CONFIG: simulationConfig };

  let runtimeConfig = config;
  if (AgentClass === StubAgent && typeof config.model_usage_rate !== 'number') {
    runtimeConfig = { ...config, model_usage_rate: 0.5 };
  }

  let doStub;
  if (env.AGENT_STATE) {
    const doId = env.AGENT_STATE.idFromName(config.durable_object_id);
    doStub = env.AGENT_STATE.get(doId);
  }

  return new AgentClass(runtimeConfig, agentEnv, doStub);
}

/**
 * Loads an agent's persisted state (including configOverrides — see
 * agent-base.js loadState()), runs one case through it, and returns a
 * summary suitable for logging.
 */
export async function runAgentSession(agentId, caseData, env, opts = {}) {
  const agent = instantiateAgent(agentId, env);
  await agent.loadState();
  const result = await agent.handleCase(caseData, opts);
  return {
    agentId,
    result,
    mood: agent.mood,
    irritation: agent.irritation,
    isHappy: agent.isHappy,
    isAngry: agent.isAngry,
    isPanic: agent.isPanic,
    panicLevel: agent.panicLevel,
    configOverrides: agent.configOverrides || {},
  };
}

function corsHeaders(origin) {
  const headers = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token' };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return headers;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
}

function pad(n, len) {
  return String(n).padStart(len, '0');
}

/* ──────────────────────────── Status / read APIs ───────────────────────── */

async function getAllAgentStatuses(env) {
  const statuses = [];
  for (const config of agentsConfig.agents) {
    const agent = instantiateAgent(config.id, env);
    await agent.loadState();
    statuses.push({
      id: agent.id,
      key: agent.key,
      name: agent.name,
      role: config.role,
      tier: config.tier,
      clearance: config.clearance,
      status: config.status || 'active',
      mood: agent.mood,
      irritation: agent.irritation,
      isHappy: agent.isHappy,
      isAngry: agent.isAngry,
      isPanic: agent.isPanic,
      panicLevel: agent.panicLevel,
      session: agent.session,
      quotas: config.quotas || null,
      configOverrides: agent.configOverrides || {},
      last_active: agent.session?.started_at || null,
    });
  }
  return statuses;
}

async function getRecentInteractions(env, limit = 50) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT i.*, a.name AS agent_name FROM interactions i
     JOIN agents a ON a.id = i.agent_id
     ORDER BY i.timestamp DESC LIMIT ?`
  ).bind(limit).all();
  return results;
}

async function getReports(env, type) {
  if (!env.DB) return [];
  const stmt = type
    ? env.DB.prepare(`SELECT * FROM reports WHERE type = ? ORDER BY created_at DESC LIMIT 100`).bind(type)
    : env.DB.prepare(`SELECT * FROM reports ORDER BY created_at DESC LIMIT 100`);
  const { results } = await stmt.all();
  return results;
}

async function getSuggestions(env) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT * FROM suggestions
     ORDER BY CASE permission_level WHEN 'root' THEN 0 WHEN 'sudo' THEN 1 ELSE 2 END, created_at DESC
     LIMIT 100`
  ).all();
  return results;
}

/* ─────────────────────────── Simulation state ─────────────────────────── */

/**
 * Simulation control state lives in KV (binding: SIM_KV) as a small JSON
 * override merged over simulation-config.json's SIMULATION block. Falls
 * back to the static config defaults if SIM_KV isn't bound yet.
 */
const SIM_STATE_KEY = 'simulation-state';

async function getSimulationState(env) {
  const base = { ...simulationConfig.SIMULATION, paused: false };
  if (!env.SIM_KV) return base;
  const stored = await env.SIM_KV.get(SIM_STATE_KEY, 'json');
  return { ...base, ...(stored || {}) };
}

async function updateSimulationState(env, patch) {
  const current = await getSimulationState(env);
  const allowedKeys = ['inspection_mode', 'paused', 'phase'];
  const next = { ...current };
  for (const key of allowedKeys) {
    if (key in patch) next[key] = patch[key];
  }
  if (env.SIM_KV) await env.SIM_KV.put(SIM_STATE_KEY, JSON.stringify(next));
  return next;
}

/* ───────────────────────────── Year tracker ────────────────────────────── */

function emptyYearStats() {
  return { ...JSON.parse(JSON.stringify(yearTrackerSeed.stats)), year_number: 1 };
}

/** Reads the latest `year_stats` row, seeding from year-tracker.json if none exists yet. */
async function getYearState(env) {
  if (!env.DB) {
    return {
      simulation_start: null,
      current_day: 0,
      current_week: 0,
      current_month: 0,
      current_quarter: 0,
      total_days: yearTrackerSeed.total_days,
      stats: emptyYearStats(),
    };
  }

  const row = await env.DB.prepare(`SELECT * FROM year_stats ORDER BY recorded_at DESC LIMIT 1`).first().catch(() => null);
  if (!row) {
    return {
      simulation_start: new Date().toISOString(),
      current_day: 0,
      current_week: 0,
      current_month: 0,
      current_quarter: 0,
      total_days: yearTrackerSeed.total_days,
      stats: emptyYearStats(),
    };
  }

  return {
    simulation_start: row.simulation_start,
    current_day: row.current_day,
    current_week: row.current_week,
    current_month: row.current_month,
    current_quarter: row.current_quarter,
    total_days: yearTrackerSeed.total_days,
    stats: { ...emptyYearStats(), ...JSON.parse(row.stats || '{}') },
  };
}

async function persistYearState(env, state) {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT INTO year_stats (id, simulation_start, current_day, current_week, current_month, current_quarter, stats, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).bind(
    crypto.randomUUID(),
    state.simulation_start,
    state.current_day,
    state.current_week,
    state.current_month,
    state.current_quarter,
    JSON.stringify(state.stats || {})
  ).run().catch(() => {});
}

function updateYearStats(prevStats, { summary, standup, sidePlotStarted, sidePlotUpdates }) {
  const stats = { ...emptyYearStats(), ...(prevStats || {}) };

  for (const a of summary.agents) {
    stats.total_cases_handled += a.handled || 0;
    stats.total_cases_by_agent[a.agentId] = (stats.total_cases_by_agent[a.agentId] || 0) + (a.handled || 0);
    stats.total_trainee_panic_escalations += a.escalations || 0;
    stats.avg_mood_by_agent[a.agentId] = a.mood;
  }

  if (standup && !standup.error) {
    stats.total_meetings += 1;
    stats.total_meetings_by_type.daily_standup = (stats.total_meetings_by_type.daily_standup || 0) + 1;
  }

  for (const plot of sidePlotStarted || []) {
    stats.total_side_plots += 1;
    stats.total_side_plots_by_type[plot.type] = (stats.total_side_plots_by_type[plot.type] || 0) + 1;
    if (plot.type === 'rivalry_escalation') stats.rivalry_escalation_count += 1;
  }

  for (const u of sidePlotUpdates || []) {
    if (u.status === 'resolved' && u.type === 'pip_drama') {
      stats.total_pip_placements += 1;
    }
  }

  return stats;
}

/* ─────────────────────────────── GitHub ────────────────────────────────── */

/**
 * Commits a file to a repo via the GitHub Contents API. No-ops if
 * env.GITHUB_TOKEN (a Worker secret, never shipped to the browser) isn't
 * configured.
 */
async function commitFileToRepo(env, repoName, path, content, message) {
  if (!env.GITHUB_TOKEN) return { committed: false, reason: 'GITHUB_TOKEN not configured' };

  const url = `https://api.github.com/repos/${REPO_OWNER}/${repoName}/contents/${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'data-center-agent-sim',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(content))) }),
  });
  return { committed: res.ok, status: res.status, path };
}

/* ─────────────────────────── Config overrides ──────────────────────────── */

/**
 * Merges `overrides` into an agent's durable `configOverrides` (DO state).
 * agent-base.js's loadState() merges configOverrides over the static
 * agents-config.json entry the next time the agent is instantiated.
 */
async function applyConfigOverride(env, agentId, overrides) {
  const config = getAgentConfig(agentId);
  if (!env.AGENT_STATE || !config) return;

  const doId = env.AGENT_STATE.idFromName(config.durable_object_id);
  const stub = env.AGENT_STATE.get(doId);

  const res = await stub.fetch('https://agent-state/state');
  const data = await res.json().catch(() => ({}));
  const merged = { ...(data.configOverrides || {}), ...overrides };

  await stub.fetch('https://agent-state/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, configOverrides: merged, updated_at: new Date().toISOString() }),
  });
}

/* ──────────────────────────────── Side plots ───────────────────────────── */

async function getSidePlots(env, status) {
  if (!env.DB) return [];
  const stmt = status
    ? env.DB.prepare(`SELECT * FROM side_plots WHERE status = ? ORDER BY created_at DESC LIMIT 50`).bind(status)
    : env.DB.prepare(`SELECT * FROM side_plots ORDER BY created_at DESC LIMIT 50`);
  const { results } = await stmt.all();
  return results.map((r) => ({ ...r, agents: JSON.parse(r.agents || '[]') }));
}

async function countActiveSidePlots(env) {
  if (!env.DB) return 0;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM side_plots WHERE status = 'active'`).first().catch(() => null);
  return row?.n || 0;
}

async function hasActiveSidePlot(env, type) {
  if (!env.DB) return false;
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM side_plots WHERE status = 'active' AND type = ?`).bind(type).first().catch(() => null);
  return (row?.n || 0) > 0;
}

/** Starts a new side plot (side-plots.json side_plot_types[type]) if under max_concurrent and not already active. */
async function startSidePlot(env, type, agentIds, startDay) {
  const typeConfig = sidePlotsConfig.side_plot_types[type];
  if (!typeConfig || !env.DB) return null;
  if (await countActiveSidePlots(env) >= sidePlotsConfig.lifecycle.max_concurrent) return null;
  if (await hasActiveSidePlot(env, type)) return null;

  const duration = Array.isArray(typeConfig.duration_days)
    ? typeConfig.duration_days[typeConfig.duration_days.length - 1]
    : typeConfig.duration_days;

  const id = crypto.randomUUID();
  const reportPath = typeConfig.output_path
    .replace('{{type}}', type)
    .replace('{{start_date}}', new Date().toISOString().slice(0, 10));

  await env.DB.prepare(
    `INSERT INTO side_plots (id, type, agents, start_day, duration_days, current_stage, status, log, report_path, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 'active', '', ?, CURRENT_TIMESTAMP)`
  ).bind(id, type, JSON.stringify(agentIds), startDay, duration, reportPath).run().catch(() => {});

  return { id, type, agents: agentIds, start_day: startDay, duration_days: duration, report_path: reportPath };
}

function renderSidePlotReport(plot, typeConfig, log) {
  const agents = JSON.parse(plot.agents || '[]');
  return `# ${typeConfig.label} — started day ${plot.start_day}

## Agents involved

${agents.map((a) => `- Agent ${a}`).join('\n')}

## Timeline

${log}

## Resolution

${typeConfig.resolution}
`;
}

/** Advances `current_stage` for every active side plot whose stage list has an entry for `currentDay`. */
async function advanceSidePlots(env, currentDay) {
  if (!env.DB) return [];
  const { results: active } = await env.DB.prepare(`SELECT * FROM side_plots WHERE status = 'active'`).all();
  const updates = [];

  for (const plot of active) {
    const typeConfig = sidePlotsConfig.side_plot_types[plot.type];
    if (!typeConfig) continue;

    const dayOffset = currentDay - plot.start_day + 1;
    const stage = typeConfig.stages.find((s) => s.day === dayOffset);
    if (!stage || dayOffset <= plot.current_stage) continue;

    const logLine = `Day ${dayOffset}: ${stage.event}`;
    const newLog = plot.log ? `${plot.log}\n${logLine}` : logLine;
    const lastStageDay = typeConfig.stages[typeConfig.stages.length - 1].day;
    const isFinal = dayOffset >= lastStageDay;
    const status = isFinal ? 'resolved' : 'active';

    await env.DB.prepare(
      `UPDATE side_plots SET current_stage = ?, log = ?, status = ?, resolved_at = ? WHERE id = ?`
    ).bind(dayOffset, newLog, status, isFinal ? new Date().toISOString() : null, plot.id).run().catch(() => {});

    if (isFinal) {
      const markdown = renderSidePlotReport(plot, typeConfig, newLog);
      await commitFileToRepo(env, REPO_NAME, plot.report_path, markdown, `chore(agents): ${plot.type} side plot resolved [skip ci]`);
    }

    updates.push({ id: plot.id, type: plot.type, dayOffset, stage: stage.event, status });
  }

  return updates;
}

/**
 * Heuristic checks run once per work-day cycle to seed new side plots
 * (side-plots.json side_plot_types triggers).
 */
async function maybeStartSidePlots(env, { day, summary, cases, standup }) {
  const started = [];

  // rivalry_escalation: Architect (10) repeatedly irritated by audits.
  const architect = summary.agents.find((a) => a.agentId === 10);
  if (architect && architect.irritation >= 2) {
    const plot = await startSidePlot(env, 'rivalry_escalation', [10, 8], day);
    if (plot) started.push(plot);
  }

  // client_crisis: a critical, unique-client, IT-Chief-required case today.
  const crisisCase = (cases || []).find((c) => c.severity === 'critical' && c.is_unique_client && c.requires_it_chief);
  if (crisisCase) {
    const plot = await startSidePlot(env, 'client_crisis', [5, crisisCase.assigned_to, 11], day);
    if (plot) started.push(plot);
  }

  // breakthrough: an agent ended HAPPY after handling an advanced case.
  const breakthroughAgent = summary.agents.find((a) => a.isHappy && a.advancedCases > 0);
  if (breakthroughAgent && Math.random() < 0.5) {
    const senior = breakthroughAgent.agentId === 5 || breakthroughAgent.agentId === 10
      ? null
      : (Math.random() < 0.5 ? 5 : 10);
    const agents = senior ? [breakthroughAgent.agentId, senior] : [breakthroughAgent.agentId];
    const plot = await startSidePlot(env, 'breakthrough', agents, day);
    if (plot) started.push(plot);
  }

  // comparison_event: an agent logged a "compare alternatives" event today.
  const comparisonAgent = summary.agents.find((a) => a.comparisons > 0);
  if (comparisonAgent) {
    const agents = Math.random() < 0.5 ? [comparisonAgent.agentId, 6] : [comparisonAgent.agentId];
    const plot = await startSidePlot(env, 'comparison_event', agents, day);
    if (plot) started.push(plot);
  }

  // inspiration_event: Designer (9) crosses inspired_threshold.
  const designer = instantiateAgent(9, env);
  await designer.loadState();
  const inspiredThreshold = designer.config.inspired_threshold ?? 51;
  if (designer.mood >= inspiredThreshold) {
    const source = Math.random() < 0.5 ? 11 : 10;
    const plot = await startSidePlot(env, 'inspiration_event', [9, source], day);
    if (plot) started.push(plot);
  }

  // meeting_tension: today's standup left 2+ agents irritated.
  if (standup && !standup.error && (standup.decisions?.irritation_effects?.length || 0) >= 2) {
    const plot = await startSidePlot(env, 'meeting_tension', standup.attendees, day);
    if (plot) started.push(plot);
  }

  return started;
}

/* ─────────────────────────────── Reporting ─────────────────────────────── */

function renderDailySummary(yearState, summary, standup, sidePlotStarted, sidePlotUpdates, milestone) {
  const agentLines = summary.agents
    .map((a) => `- Agent ${a.agentId}: ${a.handled}/${a.caseCount} cases, mood ${a.mood}, irritation ${a.irritation}${a.isAngry ? ' (ANGRY)' : ''}${a.isPanic ? ' (PANIC)' : ''}`)
    .join('\n') || '_No agents processed cases today._';

  const startedLines = sidePlotStarted.map((p) => `- Started: ${p.type} (agents ${p.agents.join(', ')})`).join('\n');
  const updateLines = sidePlotUpdates.map((u) => `- ${u.type}: ${u.stage} (${u.status})`).join('\n');
  const sidePlotLines = [startedLines, updateLines].filter(Boolean).join('\n') || '_None._';

  return `# Day ${yearState.current_day} Summary — ${new Date().toISOString()}

Week ${yearState.current_week}, Month ${yearState.current_month}, Quarter ${yearState.current_quarter} (Year ${yearState.stats.year_number || 1}).
${milestone ? `\n**Milestone: ${milestone.label}** — ${milestone.description}\n` : ''}
## Case Handling

${agentLines}

## Daily Standup

${standup?.transcript ? standup.transcript : standup?.error ? `_Standup error: ${standup.error}_` : '_No standup recorded._'}

## Side Plot Activity

${sidePlotLines}
`;
}

function renderPromotionResults(yearNumber, meeting) {
  const decisions = meeting.decisions || {};
  const overrides = (decisions.config_overrides || [])
    .map((o) => `- Agent ${o.agent_id}: ${JSON.stringify(o.overrides)} — ${o.reason}`)
    .join('\n') || '_None recorded._';

  return `# Year ${yearNumber} Promotion Results

## Summary

${decisions.summary || '_No summary provided._'}

## Approved Promotions / Config Overrides

${overrides}

## Action Items for Year ${yearNumber + 1}

${(decisions.action_items || []).map((a) => `- [ ] ${a}`).join('\n') || '_None._'}

## Full Yearly Meeting Transcript

${meeting.transcript || '_Not available._'}
`;
}

/* ─────────────────────────────── Work day cycle ────────────────────────── */

/** Normalizes the differing handleCase() return shapes across agent classes. */
function extractOutcome(raw) {
  if (!raw) return { result: null, escalation: null, quality: undefined };
  if (Object.prototype.hasOwnProperty.call(raw, 'escalation') || Object.prototype.hasOwnProperty.call(raw, 'guide')) {
    return { result: raw.result || null, escalation: raw.escalation || null, quality: raw.result?.quality };
  }
  return { result: raw, escalation: null, quality: raw.quality };
}

/**
 * Joint session: the escalated agent (selected by TraineeAgent's
 * escalation protocol) also works the trainee's case. If a guide was
 * generated, commits it to data-center-archive/guides/.
 */
async function handleTraineePanic(env, event) {
  const helper = instantiateAgent(event.selectedAgent, env);
  await helper.loadState();
  await helper.handleCase(event.caseData, { archiveGuides: [] });

  let guideCommit = null;
  if (event.generatedGuide) {
    guideCommit = await commitFileToRepo(
      env,
      ARCHIVE_REPO_NAME,
      event.generatedGuide.path,
      event.generatedGuide.content,
      `docs: auto-generated guide for ${event.generatedGuide.path} [skip ci]`
    );
  }

  return { helperAgentId: event.selectedAgent, guideCommit };
}

/**
 * One simulated work day:
 *  1. CRM case generation + assignment + persistence (crm-engine.js)
 *  2. per-agent case-handling loop — mood/escalation handling, "compare
 *     alternatives" sampling, rolling model_usage_rate adjustment
 *  3. daily standup (meeting-engine.js)
 *  4. side plot lifecycle — start new / advance / resolve
 *  5. year-tracker update + milestone-triggered meeting (+ promotion
 *     results report on day 365)
 *  6. GitHub-committed daily summary
 */
export async function runWorkDayCycle(env) {
  const sim = await getSimulationState(env);
  if (sim.paused) return { skipped: true, reason: 'paused' };

  const yearState = await getYearState(env);
  const nextDay = (yearState.current_day || 0) + 1;
  const dayOfWeek = ((nextDay - 1) % 7) + 1;

  const work = simulationConfig.WORK_DAY;
  const multiplier = sim.inspection_mode ? work.inspection_mode_multiplier : 1;
  const dailyCount = Math.round(50 * multiplier);

  const cases = generateAssignedDailyBatch(dayOfWeek, { count: dailyCount, weekNumber: yearState.current_week || 1 });
  await persistCrmCases(env, cases);

  const byAgent = new Map();
  for (const c of cases) {
    if (!byAgent.has(c.assigned_to)) byAgent.set(c.assigned_to, []);
    byAgent.get(c.assigned_to).push(c);
  }

  const summary = { day: nextDay, dayOfWeek, inspection: sim.inspection_mode, agents: [] };

  for (const [agentId, agentCases] of byAgent) {
    const agent = instantiateAgent(agentId, env);
    await agent.loadState();

    if (agent.isAngry) {
      summary.agents.push({
        agentId, caseCount: agentCases.length, handled: 0, escalations: 0, comparisons: 0, advancedCases: 0,
        mood: agent.mood, irritation: agent.irritation, isHappy: false, isAngry: true, isPanic: agent.isPanic,
      });
      continue;
    }

    let handled = 0, escalations = 0, comparisons = 0, advancedCases = 0;
    for (const c of agentCases) {
      const raw = await agent.handleCase(c, { archiveGuides: [] });
      const outcome = extractOutcome(raw);
      handled += 1;
      if (c.difficulty === 'advanced') advancedCases += 1;

      if (outcome.escalation?.type === 'TRAINEE_PANIC') {
        await handleTraineePanic(env, outcome.escalation);
        escalations += 1;
      }

      // Lightweight "compare alternatives" sampling: when an interaction
      // left the agent unhappy, occasionally simulate checking an external
      // source (Agent 2's FOUND-OUTSIDE PATTERN and similar behaviors).
      if (outcome.quality !== undefined && outcome.quality < 0.5 && Math.random() < 0.3) {
        const claudeWasBetter = Math.random() < (outcome.quality + 0.3);
        await recordCompareAlternatives(env, {
          agentId,
          sessionId: agent.session?.id,
          caseId: c.id,
          claudeWasBetter,
          details: claudeWasBetter
            ? `${agent.name} found Claude's answer held up against an external source for case ${c.id}.`
            : `${agent.name} found an external source resolved case ${c.id} faster than Claude.`,
        });
        comparisons += 1;
      }

      if (agent.isAngry) break;
    }

    const adj = await getModelUsageAdjustment(env, agentId);
    if (adj.delta !== 0 && typeof agent.config.model_usage_rate === 'number') {
      const next = Math.min(1, Math.max(0, agent.config.model_usage_rate + adj.delta));
      await applyConfigOverride(env, agentId, { model_usage_rate: next });
    }

    summary.agents.push({
      agentId,
      caseCount: agentCases.length,
      handled,
      escalations,
      comparisons,
      advancedCases,
      mood: agent.mood,
      irritation: agent.irritation,
      isHappy: agent.isHappy,
      isAngry: agent.isAngry,
      isPanic: agent.isPanic,
    });
  }

  let standup = null;
  try {
    standup = await runMeeting('daily_standup', env);
  } catch (err) {
    standup = { error: err.message };
  }

  const sidePlotStarted = await maybeStartSidePlots(env, { day: nextDay, summary, cases, standup });
  const sidePlotUpdates = await advanceSidePlots(env, nextDay);

  const milestoneKey = `day_${nextDay}`;
  const milestone = yearTrackerSeed.milestones[milestoneKey] || null;
  let milestoneMeeting = null;
  if (milestone && MILESTONE_MEETINGS[milestoneKey]) {
    try {
      milestoneMeeting = await runMeeting(MILESTONE_MEETINGS[milestoneKey], env);
    } catch (err) {
      milestoneMeeting = { error: err.message };
    }
  }

  const newStats = updateYearStats(yearState.stats, { summary, standup, sidePlotStarted, sidePlotUpdates });
  const isYearEnd = nextDay >= yearTrackerSeed.total_days;

  const newState = {
    simulation_start: yearState.simulation_start || new Date().toISOString(),
    current_day: isYearEnd ? 0 : nextDay,
    current_week: isYearEnd ? 0 : Math.ceil(nextDay / 7),
    current_month: isYearEnd ? 0 : Math.ceil(nextDay / 30),
    current_quarter: isYearEnd ? 0 : Math.ceil(nextDay / 91),
    stats: isYearEnd ? { ...newStats, year_number: (newStats.year_number || 1) + 1 } : newStats,
  };
  await persistYearState(env, newState);

  if (milestoneKey === 'day_365' && milestoneMeeting && !milestoneMeeting.error) {
    const yearNumber = newStats.year_number || 1;
    const promoMarkdown = renderPromotionResults(yearNumber, milestoneMeeting);
    await commitFileToRepo(
      env, REPO_NAME, `agents/reports/promotion-results-year-${yearNumber}.md`, promoMarkdown,
      `chore(agents): year ${yearNumber} promotion results [skip ci]`
    );
  }

  const displayYearState = {
    ...yearState,
    current_day: nextDay,
    current_week: Math.ceil(nextDay / 7),
    current_month: Math.ceil(nextDay / 30),
    current_quarter: Math.ceil(nextDay / 91),
    stats: newStats,
  };
  const markdown = renderDailySummary(displayYearState, summary, standup, sidePlotStarted, sidePlotUpdates, milestone);
  const report = await commitFileToRepo(
    env, REPO_NAME, `agents/reports/daily/day-${pad(nextDay, 3)}-summary.md`, markdown,
    `chore(agents): day ${nextDay} summary [skip ci]`
  );

  return { ...summary, year: newState, standup, sidePlotsStarted: sidePlotStarted, sidePlotUpdates, milestone, milestoneMeeting, report };
}

/* ─────────────────────────── Weekly reset cycle ─────────────────────────── */

async function getWeeklyCasesHandled(env, agentId) {
  if (!env.DB) return 0;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(cases_handled), 0) AS total FROM agent_sessions WHERE agent_id = ? AND started_at >= ?`
  ).bind(agentId, since).first();
  return row?.total || 0;
}

async function writeWeeklyAnalytics(env, summary) {
  if (!env.DB) return;
  const stmt = env.DB.prepare(
    `INSERT INTO weekly_analytics (id, week_start, agent_id, total_cases, cases_solved, avg_mood)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  await env.DB.batch(
    summary.agents.map((a) => stmt.bind(crypto.randomUUID(), summary.week_start, a.agentId, a.weeklyCases, a.weeklyCases, a.moodAfter))
  );
}

/**
 * One simulated work week:
 *  1-2. weekly report + partial mood reset for every agent
 *  3. Agent 2 bonus-day check -> bonus_day_drama side plot
 *  4. weekly meeting + a rotating per-agent (1-4) audit_session
 *  5. a low-mood agent (1-4) triggers a pip_session + pip_drama side plot
 *  6. weekly_analytics aggregate
 */
export async function runWeeklyResetCycle(env) {
  const yearState = await getYearState(env);
  const summary = { week_start: new Date().toISOString(), agents: [] };

  for (const config of agentsConfig.agents) {
    const agent = instantiateAgent(config.id, env);
    await agent.loadState();

    const moodBefore = agent.mood;
    const weeklyCases = await getWeeklyCasesHandled(env, config.id);

    await agent.fileWeeklyReport(
      `Weekly report for ${agent.name}: ${weeklyCases} cases handled, mood ${moodBefore} -> regressing to mean, irritation ${agent.irritation}/5.`
    );

    if (typeof agent.checkWeeklyBonus === 'function') {
      const target = simulationConfig.WORK_DAY.cases_per_day_min * 5;
      const bonus = await agent.checkWeeklyBonus(weeklyCases, target);
      if (bonus && config.id === 2) {
        await startSidePlot(env, 'bonus_day_drama', [2, 1, 3, 4], yearState.current_day || 1);
      }
    }

    await agent.resetWeeklyState();
    summary.agents.push({ agentId: config.id, weeklyCases, moodBefore, moodAfter: agent.mood });
  }

  await writeWeeklyAnalytics(env, summary);

  let weekly = null;
  try {
    weekly = await runMeeting('weekly', env);
  } catch (err) {
    weekly = { error: err.message };
  }

  const auditTarget = ((yearState.current_week || 1) - 1) % 4 + 1;
  let audit = null;
  try {
    audit = await runMeeting('audit_session', env, { auditedAgentId: auditTarget });
  } catch (err) {
    audit = { error: err.message };
  }

  let pip = null;
  const lowMoodAgent = summary.agents.find((a) => a.agentId >= 1 && a.agentId <= 4 && a.moodAfter <= 20);
  if (lowMoodAgent) {
    try {
      pip = await runMeeting('pip_session', env, { targetAgentId: lowMoodAgent.agentId });
      await startSidePlot(env, 'pip_drama', [7, lowMoodAgent.agentId], yearState.current_day || 1);
    } catch (err) {
      pip = { error: err.message };
    }
  }

  return { ...summary, weekly, audit, pip };
}

/* ────────────────────────────────── HTTP API ───────────────────────────── */

export default {
  /**
   * Cron Triggers (configure in this Worker's wrangler.toml):
   *   "0 *\/1 * * *" -> runWorkDayCycle()    (every hour = 1 simulated work day)
   *   "0 0 * * *"    -> runWeeklyResetCycle() (every 24h = 1 simulated work week)
   */
  async scheduled(event, env, ctx) {
    if (event.cron === '0 */1 * * *') {
      ctx.waitUntil(runWorkDayCycle(env));
    } else if (event.cron === '0 0 * * *') {
      ctx.waitUntil(runWeeklyResetCycle(env));
    }
  },

  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // All /api/agents/* endpoints require the admin token configured as a
    // Worker secret (env.ADMIN_TOKEN). The browser never embeds this value
    // — the admin types it into the dashboard once and it's sent back as
    // X-Admin-Token, so the real check always happens server-side here.
    if (url.pathname.startsWith('/api/agents/')) {
      const token = request.headers.get('X-Admin-Token') || '';
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return json({ error: 'unauthorized' }, 401, origin);
      }
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/agents/status') {
        return json(await getAllAgentStatuses(env), 200, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/agents/sessions') {
        const limit = Number(url.searchParams.get('limit')) || 50;
        return json(await getRecentInteractions(env, limit), 200, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/agents/reports') {
        return json(await getReports(env, url.searchParams.get('type')), 200, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/agents/suggestions') {
        return json(await getSuggestions(env), 200, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/agents/year') {
        return json(await getYearState(env), 200, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/agents/side-plots') {
        return json(await getSidePlots(env, url.searchParams.get('status')), 200, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/agents/run') {
        // Manual single-case trigger for local testing: { agentId, caseData, opts }
        const body = await request.json();
        const result = await runAgentSession(body.agentId, body.caseData, env, body.opts || {});
        return json(result, 200, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/agents/trigger') {
        // Unified admin trigger: { type: 'day'|'meeting'|'inspection'|'week_reset', ...opts }
        const body = await request.json();
        let result;
        switch (body.type) {
          case 'day':
            result = await runWorkDayCycle(env);
            break;
          case 'meeting': {
            if (!body.meetingType || !MEETING_TYPES[body.meetingType]) {
              return json({ error: 'invalid_meeting_type' }, 400, origin);
            }
            try {
              result = await runMeeting(body.meetingType, env, body.opts || {});
            } catch (err) {
              return json({ error: 'meeting_error', message: err.message }, 400, origin);
            }
            break;
          }
          case 'inspection':
            result = await updateSimulationState(env, { inspection_mode: !!body.active });
            break;
          case 'week_reset':
            result = await runWeeklyResetCycle(env);
            break;
          default:
            return json({ error: 'invalid_trigger_type' }, 400, origin);
        }
        return json({ ok: true, type: body.type, result }, 200, origin);
      }
      if (request.method === 'GET' && url.pathname === '/api/simulation') {
        return json(await getSimulationState(env), 200, origin);
      }
      if (request.method === 'POST' && url.pathname === '/api/simulation') {
        const body = await request.json();
        return json(await updateSimulationState(env, body), 200, origin);
      }
    } catch (err) {
      return json({ error: 'general', message: err.message }, 500, origin);
    }

    return json({ error: 'not_found' }, 404, origin);
  },
};
