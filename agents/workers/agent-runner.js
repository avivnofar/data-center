/**
 * Data Center — AI Agent Simulation — agent runner Worker.
 *
 * Two responsibilities:
 *   1. `instantiateAgent()` / `runAgentSession()` — used by scheduler.js
 *      to actually run an agent against a case.
 *   2. HTTP API for the Admin tab (agents/dashboard/) — read-only status,
 *      live session feed, reports, and suggestions, all backed by D1.
 *
 * Bindings expected (see agents/README.md):
 *   DB           - D1 database (schema.sql)
 *   AGENT_STATE  - Durable Object namespace (state-manager.js AgentStateDO)
 *   GEMINI_API_KEY - secret
 *
 * Status: DRAFT (Phase 1 foundation).
 */

import agentsConfig from '../config/agents-config.json';
import simulationConfig from '../config/simulation-config.json';

import { PerfectionistAgent } from '../agents/agent-1-perfectionist.js';
import { ProductiveAgent } from '../agents/agent-2-productive.js';
import { StandardAgent } from '../agents/agent-3-standard.js';
import { TraineeAgent } from '../agents/agent-4-trainee.js';
import { StubAgent } from '../agents/agent-stub.js';

const ALLOWED_ORIGINS = ['https://avivnofar.github.io', 'http://localhost:3000', 'http://127.0.0.1:5500'];

/** Phase 1 agents get full implementations; 5-11 fall back to StubAgent. */
export const AGENT_CLASSES = {
  1: PerfectionistAgent,
  2: ProductiveAgent,
  3: StandardAgent,
  4: TraineeAgent,
};

export function getAgentConfig(id) {
  return agentsConfig.agents.find((a) => a.id === id);
}

export function instantiateAgent(id, env) {
  const config = getAgentConfig(id);
  if (!config) throw new Error(`Unknown agent id ${id}`);

  const AgentClass = AGENT_CLASSES[id] || StubAgent;
  const agentEnv = { ...env, SIM_CONFIG: simulationConfig };

  let doStub;
  if (env.AGENT_STATE) {
    const doId = env.AGENT_STATE.idFromName(config.durable_object_id);
    doStub = env.AGENT_STATE.get(doId);
  }

  return new AgentClass(config, agentEnv, doStub);
}

/**
 * Loads an agent's persisted state, runs one case through it, and returns
 * a summary suitable for logging by the scheduler.
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

async function getSuggestions(env) {
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT * FROM suggestions
     ORDER BY CASE permission_level WHEN 'root' THEN 0 WHEN 'sudo' THEN 1 ELSE 2 END, created_at DESC
     LIMIT 100`
  ).all();
  return results;
}

export default {
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
      if (request.method === 'POST' && url.pathname === '/api/agents/run') {
        // Manual trigger for local testing: { agentId, caseData, opts }
        const body = await request.json();
        const result = await runAgentSession(body.agentId, body.caseData, env, body.opts || {});
        return json(result, 200, origin);
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
