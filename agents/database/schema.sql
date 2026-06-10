-- Data Center — AI Agent Simulation — Cloudflare D1 schema
-- Status: DRAFT (Phase 1 foundations). Agents 5-11 are stubs; their rows
-- exist in `agents` so foreign keys resolve, but no sessions/cases are
-- generated for them until Phase 2.

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tier TEXT NOT NULL,
  clearance TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  mode TEXT NOT NULL,
  cases_handled INTEGER DEFAULT 0,
  mood_start INTEGER,
  mood_end INTEGER,
  irritation_events INTEGER DEFAULT 0,
  happy_events INTEGER DEFAULT 0,
  extended_session BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  assigned_to INTEGER,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  resolution_time_minutes INTEGER,
  FOREIGN KEY (assigned_to) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  type TEXT NOT NULL,
  query TEXT,
  response_summary TEXT,
  mood_before INTEGER,
  mood_after INTEGER,
  irritation_change INTEGER DEFAULT 0,
  state_change TEXT,
  FOREIGN KEY (session_id) REFERENCES agent_sessions(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id TEXT PRIMARY KEY,
  agent_id INTEGER NOT NULL,
  permission_level TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  auto_apply BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS weekly_analytics (
  id TEXT PRIMARY KEY,
  week_start TIMESTAMP NOT NULL,
  agent_id INTEGER NOT NULL,
  total_cases INTEGER DEFAULT 0,
  cases_solved INTEGER DEFAULT 0,
  avg_mood REAL,
  irritation_count INTEGER DEFAULT 0,
  happy_count INTEGER DEFAULT 0,
  overtime_days INTEGER DEFAULT 0,
  suggestions_filed INTEGER DEFAULT 0,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_agent ON reports(agent_id);
