/**
 * Data Center — AI Agent Simulation — AgentBase.
 *
 * Base class for all 11 simulated agents (agent-1..4 implement full
 * behavior in Phase 1; agent-5..11 use agent-stub.js, which extends this
 * unchanged). Encapsulates the shared state machine, session bookkeeping,
 * Gemini calls, report/suggestion filing, live-app interaction, and
 * Durable Object persistence described in agents/AGENTS.md.
 *
 * Status: DRAFT (Phase 1 foundation) — interfaces and critical paths first,
 * heuristics (e.g. evaluateResponseQuality, getDbContext) are placeholders.
 */

import { queryGemini } from '../workers/gemini-client.js';

const MOOD_MIN = 0;
const MOOD_MAX = 100;
const IRRITATION_MAX = 5;

export class AgentBase {
  /**
   * @param {object} config - this agent's entry from agents-config.json
   * @param {object} env - Worker env (DB, GEMINI_API_KEY, SIM_CONFIG, APP_API_BASE, ...)
   * @param {object} [doStub] - Durable Object stub bound to this agent's state
   */
  constructor(config, env, doStub) {
    this.config = config;
    this.env = env;
    this.doStub = doStub;

    this.id = config.id;
    this.key = config.key;
    this.name = config.name;
    this.clearance = config.clearance;

    // 1. State machine
    this.mood = 50;
    this.irritation = 0;
    this.isHappy = false;
    this.isAngry = false;

    // Trainee-only extra state (harmless on other agents)
    this.isPanic = false;
    this.panicLevel = 0;

    // Permanent flags survive resetWeeklyState() (e.g. Agent 2's
    // "slow_ui"/"sloppy_design" irritation that persists until fixed)
    this.permanentIrritationFlags = [];

    // Durable per-agent config tweaks written by meeting-engine.js
    // (decisions.config_overrides) and agent-runner.js (rolling
    // model_usage_rate adjustments). Merged over `this.config` on load and
    // persisted alongside the rest of the state so they survive restarts.
    this.configOverrides = {};

    this.session = null;
  }

  /* ───────────────────────── 1. State machine ───────────────────────── */

  async adjustMood(delta) {
    this.mood = Math.min(MOOD_MAX, Math.max(MOOD_MIN, this.mood + delta));
    await this.saveState();
    return this.mood;
  }

  async addIrritiation() {
    this.irritation = Math.min(IRRITATION_MAX, this.irritation + 1);
    const angryThreshold = this.config.irritation_stack?.angry_threshold ?? IRRITATION_MAX;
    if (this.irritation >= angryThreshold && !this.isAngry) {
      await this.triggerAngry(`${this.name}: irritation stack reached ${this.irritation}/${IRRITATION_MAX}`);
    }
    await this.saveState();
    return this.irritation;
  }

  async resolveIrritation() {
    this.irritation = Math.max(0, this.irritation - 1);
    if (this.irritation === 0) this.isAngry = false;
    await this.saveState();
    return this.irritation;
  }

  async triggerHappy() {
    this.isHappy = true;
    await this.adjustMood(10);
    return this.config.states?.HAPPY?.effects || [];
  }

  async triggerAngry(summary = `${this.name} reached the ANGRY state`) {
    this.isAngry = true;
    await this.fileIncidentReport(summary);
    if (this.session) await this.endSession();
    await this.saveState();
  }

  /** Trainee-only: bumps panicLevel and runs the escalation protocol at >= 80. */
  async addPanic(delta) {
    this.panicLevel = Math.min(100, Math.max(0, this.panicLevel + delta));
    if (this.panicLevel >= 80 && !this.isPanic) {
      this.isPanic = true;
    }
    await this.saveState();
    return this.panicLevel;
  }

  async resolvePanic() {
    this.panicLevel = 0;
    this.isPanic = false;
    await this.saveState();
  }

  /** Weekly reset: regress mood to the mean, clear non-permanent irritation. */
  async resetWeeklyState() {
    this.mood = Math.round((this.mood + 50) / 2);
    if (this.permanentIrritationFlags.length === 0) {
      this.irritation = 0;
      this.isAngry = false;
    }
    this.isHappy = false;
    await this.saveState();
    return { mood: this.mood, irritation: this.irritation };
  }

  /* ─────────────────────── 2. Session management ────────────────────── */

  async startSession(caseData, mode = 'search') {
    this.session = {
      id: crypto.randomUUID(),
      agent_id: this.id,
      started_at: new Date().toISOString(),
      ended_at: null,
      mode,
      cases_handled: 0,
      mood_start: this.mood,
      mood_end: null,
      irritation_events: 0,
      happy_events: 0,
      extended_session: false,
      case: caseData || null,
    };

    if (this.env.DB) {
      await this.env.DB.prepare(
        `INSERT INTO agent_sessions (id, agent_id, started_at, mode, mood_start) VALUES (?, ?, ?, ?, ?)`
      ).bind(this.session.id, this.id, this.session.started_at, mode, this.mood).run();
    }

    await this.saveState();
    return this.session;
  }

  async endSession() {
    if (!this.session) return null;

    this.session.ended_at = new Date().toISOString();
    this.session.mood_end = this.mood;

    if (this.env.DB) {
      await this.env.DB.prepare(
        `UPDATE agent_sessions
         SET ended_at = ?, mood_end = ?, cases_handled = ?, irritation_events = ?, happy_events = ?, extended_session = ?
         WHERE id = ?`
      ).bind(
        this.session.ended_at,
        this.mood,
        this.session.cases_handled,
        this.session.irritation_events,
        this.session.happy_events,
        this.session.extended_session ? 1 : 0,
        this.session.id
      ).run();
    }

    const finished = this.session;
    this.session = null;
    await this.saveState();
    return finished;
  }

  /** Applies session_extension_multiplier from agents-config.json. */
  async extendSession() {
    if (!this.session) return false;
    const multiplier = this.config.session_extension_multiplier || 1;
    this.session.extended_session = true;
    this.session.cases_handled = Math.ceil((this.session.cases_handled || 0) * multiplier) || this.session.cases_handled;
    await this.saveState();
    return true;
  }

  /* ──────────────────────── 3. Gemini integration ───────────────────── */

  /**
   * Calls Gemini 2.0 Flash with the agent's personality + current state +
   * behavioral rules + (placeholder) DB context prepended to systemPrompt.
   */
  async queryGemini(prompt, systemPrompt, opts = {}) {
    const simConfig = this.env.SIM_CONFIG?.GEMINI || {};
    const dbContext = await this.getDbContext(prompt);

    const stateLine = this.isPanic
      ? `Current state: mood=${this.mood}, panic=${this.panicLevel}/100.`
      : `Current state: mood=${this.mood}, irritation=${this.irritation}/5, angry=${this.isAngry}.`;

    const fullSystemPrompt = [
      systemPrompt || this.config.system_prompt_additions || '',
      stateLine,
      (this.config.behavioral_rules || []).length
        ? `Behavioral rules:\n- ${this.config.behavioral_rules.join('\n- ')}`
        : '',
      dbContext ? `Relevant Data Center entries:\n${dbContext}` : '',
    ].filter(Boolean).join('\n\n');

    const result = await queryGemini({
      apiKey: this.env.GEMINI_API_KEY,
      model: simConfig.model || 'gemini-2.5-flash-lite',
      endpoint: simConfig.api_endpoint || 'https://generativelanguage.googleapis.com/v1beta/models',
      temperature: simConfig.temperature ?? 0.8,
      maxTokens: simConfig.max_tokens ?? 1024,
      prompt,
      systemPrompt: fullSystemPrompt,
      ai: this.env.AI,
      forceFallback: !!opts.forceFallback,
    });

    this.lastGeminiSource = result.source;

    if (result.source === 'cloudflare-fallback') {
      console.warn(`[agent-${this.id}] Gemini quota exhausted — used cloudflare-fallback (@cf/meta/llama-3.1-8b-instruct-fp8)`);
    }

    return result.text;
  }

  /**
   * Placeholder for "top 3 relevant entries from data-center DB".
   * Phase 2: query a precomputed index over data/*.json by keyword overlap.
   */
  async getDbContext(_query) {
    return '';
  }

  /* ─────────────────────── 4. Report generation ─────────────────────── */

  async fileIncidentReport(summary) {
    return this._fileReport('incident', `Incident — ${this.name}`, summary, 'critical');
  }

  async fileStatusReport(content) {
    return this._fileReport('status', `Status report — ${this.name}`, content, 'info');
  }

  async fileWeeklyReport(content) {
    return this._fileReport('weekly', `Weekly report — ${this.name}`, content, 'info');
  }

  /**
   * Model-education case study: filed when interactWithApp() returned a
   * quality score below the daily-schedule.json model_education_case_study
   * threshold. Queued in `reports` (type='model_education') for batch-filing
   * as a claude-action/model-education GitHub Issue.
   */
  async fileModelEducationCaseStudy(content) {
    return this._fileReport('model_education', `Model education case study — ${this.name}`, content, 'info');
  }

  /**
   * @param {string} content
   * @param {boolean} [isRoot] - escalate to "root" permission_level regardless of clearance
   */
  async fileSuggestion(content, isRoot = false) {
    const id = crypto.randomUUID();
    const permission_level = isRoot ? 'root' : this.clearance;

    if (this.env.DB) {
      await this.env.DB.prepare(
        `INSERT INTO suggestions (id, agent_id, permission_level, title, content, auto_apply, status)
         VALUES (?, ?, ?, ?, ?, 0, 'pending')`
      ).bind(id, this.id, permission_level, `Suggestion from ${this.name}`, content).run();
    }

    return id;
  }

  async _fileReport(type, title, content, severity) {
    const id = crypto.randomUUID();

    if (this.env.DB) {
      await this.env.DB.prepare(
        `INSERT INTO reports (id, agent_id, type, title, content, severity)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, this.id, type, title, content, severity).run();
    }

    return id;
  }

  /* ───────────────────── 5. App interaction simulation ──────────────── */

  /**
   * Sends a query to the live Claude API worker and updates mood/irritation
   * based on a (placeholder) quality score.
   * @param {string} query
   * @param {'search'|'diagnose'} [mode]
   */
  async interactWithApp(query, mode = 'search') {
    const base = this.env.APP_API_BASE || 'https://data-center-api.avivnofar.workers.dev';
    const moodBefore = this.mood;

    const requestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: this.env.APP_ORIGIN || 'https://avivnofar.github.io',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: query }],
        mode: mode === 'diagnose' ? 'diagnose' : 'search',
        language: 'en',
        db_context: '',
      }),
    };

    let ok = true;
    let responseText = '';
    try {
      // Cloudflare blocks a Worker from fetch()-ing another Worker's
      // *.workers.dev URL directly (error 1042) — use the APP_API service
      // binding when available, falling back to a plain fetch for local dev.
      const res = this.env.APP_API
        ? await this.env.APP_API.fetch(`${base}/api/chat`, requestInit)
        : await fetch(`${base}/api/chat`, requestInit);
      ok = res.ok;
      responseText = await res.text();
    } catch (err) {
      ok = false;
      responseText = String(err);
    }

    const quality = await this.evaluateResponseQuality(query, responseText, ok);

    if (this.session) this.session.cases_handled += 1;

    let stateChange = null;
    if (quality > 0.7 && Math.random() < (this.config.states?.HAPPY?.trigger_chance ?? 0.5)) {
      await this.triggerHappy();
      if (this.session) this.session.happy_events += 1;
      stateChange = 'HAPPY';
    } else if (quality < 0.4 && Math.random() < (this.config.states?.IRRITATED?.trigger_chance ?? 0.3)) {
      await this.addIrritiation();
      if (this.session) this.session.irritation_events += 1;
      stateChange = 'IRRITATED';
    }

    await this.logInteraction({
      type: `app_${mode}`,
      query,
      response_summary: responseText.slice(0, 500),
      mood_before: moodBefore,
      mood_after: this.mood,
      irritation_change: this.session?.irritation_events ? 1 : 0,
      state_change: stateChange,
    });

    return { ok, quality, response: responseText };
  }

  /**
   * Placeholder quality heuristic (0.0-1.0). Phase 2: replace with a
   * Gemini-as-judge call comparing the response against the case.
   */
  async evaluateResponseQuality(_query, responseText, ok) {
    if (!ok || !responseText) return 0;
    return Math.min(1, responseText.length / 800);
  }

  async logInteraction({ type, query, response_summary, mood_before, mood_after, irritation_change, state_change }) {
    if (!this.env.DB || !this.session) return null;

    const id = crypto.randomUUID();
    await this.env.DB.prepare(
      `INSERT INTO interactions
         (id, session_id, agent_id, timestamp, type, query, response_summary, mood_before, mood_after, irritation_change, state_change)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      this.session.id,
      this.id,
      new Date().toISOString(),
      type,
      query || null,
      response_summary || null,
      mood_before ?? this.session.mood_start,
      mood_after ?? this.mood,
      irritation_change || 0,
      state_change || null
    ).run();

    return id;
  }

  /* ───────────────────── 6. Durable Object persistence ───────────────── */

  /** Serializes the full agent state to its Durable Object. */
  async saveState() {
    if (!this.doStub) return null;

    const snapshot = {
      id: this.id,
      key: this.key,
      name: this.name,
      mood: this.mood,
      irritation: this.irritation,
      isHappy: this.isHappy,
      isAngry: this.isAngry,
      isPanic: this.isPanic,
      panicLevel: this.panicLevel,
      permanentIrritationFlags: this.permanentIrritationFlags,
      configOverrides: this.configOverrides,
      session: this.session,
      updated_at: new Date().toISOString(),
    };

    await this.doStub.fetch('https://agent-state/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });

    return snapshot;
  }

  /** Restores state from this agent's Durable Object, if any was saved. */
  async loadState() {
    if (!this.doStub) return null;

    const res = await this.doStub.fetch('https://agent-state/state');
    const data = await res.json().catch(() => null);
    if (data) {
      this.mood = data.mood ?? this.mood;
      this.irritation = data.irritation ?? this.irritation;
      this.isHappy = data.isHappy ?? this.isHappy;
      this.isAngry = data.isAngry ?? this.isAngry;
      this.isPanic = data.isPanic ?? this.isPanic;
      this.panicLevel = data.panicLevel ?? this.panicLevel;
      this.permanentIrritationFlags = data.permanentIrritationFlags ?? this.permanentIrritationFlags;
      this.session = data.session ?? this.session;

      // Merge durable config overrides (set by meeting-engine.js decisions
      // or agent-runner.js's rolling model_usage_rate adjustments) over the
      // static agents-config.json entry for this session.
      this.configOverrides = data.configOverrides ?? this.configOverrides;
      if (Object.keys(this.configOverrides).length) {
        this.config = { ...this.config, ...this.configOverrides };
      }
    }
    return data;
  }
}
