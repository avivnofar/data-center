#!/usr/bin/env node
// Regression test for the conversation lifecycle — Part A of the 2026-08-18
// conversation-lifecycle change in index.html.
//
// WHAT IS BEING PROTECTED
// -----------------------
// Before this change, init() restored the most recent session on every page
// load, so one thread accumulated across visits forever and every turn
// re-sent all of it as uncached input (measured: 11,431 uncached input
// tokens carried in from a 26-message thread 29 days old). Page load now
// opens a fresh, empty conversation.
//
// The dangerous way to implement that is to create a new session record on
// load. dc-sessions is capped at CONFIG.MAX_HISTORY_SESSIONS and
// createNewSession() unshifts then slices, so it evicts from the OLDEST end:
// an empty record per page load would silently destroy 50 visits' worth of
// real, message-bearing history. Creation is therefore LAZY — the record is
// written by addMessageToSession(), on the first message actually sent.
//
// Three properties are asserted here, and all three are the kind that would
// regress invisibly (no error, no broken UI — just history quietly gone):
//   1. A page load writes NO record and evicts NOTHING.
//   2. The first sent message creates exactly one record.
//   3. The sessions sidebar still lists every past conversation after a
//      fresh load, and switching to one restores its messages in full.
//      This is what makes forcing a fresh start safe rather than destructive.
//
// Functions are extracted verbatim from index.html and run against stubbed
// localStorage/DOM — no reimplementation to drift out of sync with what the
// browser actually executes.

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

function bracematch(s, startIdx, label) {
  let depth = 0, endIdx = -1;
  for (let i = startIdx; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }
  if (endIdx === -1) {
    console.error(`FAILED: could not brace-match ${label} in index.html`);
    process.exit(1);
  }
  return s.slice(startIdx, endIdx);
}

function extractFn(name) {
  const startIdx = src.indexOf(`function ${name}(`);
  if (startIdx === -1) {
    console.error(`FAILED: could not find function ${name}() in index.html`);
    process.exit(1);
  }
  return bracematch(src, startIdx, `function ${name}()`);
}

// Object literal consts (AI_STRINGS) contain commas and nested braces, so the
// simple `= [^;]+;` form used by the other test scripts is not enough here.
function extractObjConst(name) {
  const startIdx = src.indexOf(`const ${name} = {`);
  if (startIdx === -1) {
    console.error(`FAILED: could not find const ${name} in index.html`);
    process.exit(1);
  }
  const braceIdx = src.indexOf('{', startIdx);
  return `const ${name} = ` + bracematch(src, braceIdx, `const ${name}`) + ';';
}

const fnSrc = [
  extractObjConst('CONFIG'),
  extractObjConst('AI_STRINGS'),
  extractFn('escHtml'),
  extractFn('loadAiSessions'),
  extractFn('saveAiSessions'),
  extractFn('getCurrentSession'),
  extractFn('createNewSession'),
  extractFn('ensureCurrentSession'),
  extractFn('pruneEmptySessions'),
  extractFn('addMessageToSession'),
  extractFn('recordAnalytics'),
  extractFn('formatSessionDate'),
  extractFn('renderSessionList'),
].join('\n');

/* ── Stubs ─────────────────────────────────────────────────────────────────
   localStorage is a plain Map-backed object; the DOM stub is only as deep as
   renderSessionList() reaches (one element, innerHTML). ──────────────────── */
function makeEnv() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const sidebar = { innerHTML: '' };
  const document = { getElementById: (id) => (id === 'session-list' ? sidebar : null) };
  return { localStorage, document, sidebar, store };
}

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`ok    ${label}`); return; }
  failures++;
  console.error(`FAILED: ${label}${detail ? ` — ${detail}` : ''}`);
}

function build(env, { lang = 'en', modes = ['search'] } = {}) {
  return new Function('localStorage', 'document', 'LANG', 'AI_LANG', 'AI_MODES', `
    ${fnSrc}
    return { loadAiSessions, saveAiSessions, getCurrentSession, createNewSession,
             ensureCurrentSession, pruneEmptySessions, addMessageToSession,
             renderSessionList, CONFIG };
  `)(env.localStorage, env.document, lang, lang, modes);
}

/* A page load runs exactly this, per loadAiIntoPanel(). Kept as one helper so
   the test cannot accidentally assert against a load path the app does not
   have. If loadAiIntoPanel() ever does more than these two calls, this test
   is the place that has to learn about it. */
function simulatePageLoad(api, env) {
  api.pruneEmptySessions();
  env.localStorage.removeItem('dc-current-session');
}

/* Seed N message-bearing sessions directly, oldest last (newest first is the
   storage order createNewSession() maintains). */
function seedSessions(api, n, startId = 1_700_000_000_000) {
  const sessions = [];
  for (let i = 0; i < n; i++) {
    sessions.push({
      id: startId + (n - i),          // index 0 = newest
      modes: ['search'],
      language: 'en',
      messages: [
        { role: 'user', content: `question ${n - i}`, timestamp: startId },
        { role: 'assistant', content: `answer ${n - i}`, timestamp: startId },
      ],
      summary: `question ${n - i}`,
    });
  }
  api.saveAiSessions(sessions);
  return sessions;
}

/* ── 1. A page load writes no record and evicts nothing ──────────────────── */
{
  const env = makeEnv();
  const api = build(env);
  const cap = api.CONFIG.MAX_HISTORY_SESSIONS;

  // Fill dc-sessions to the cap with real conversations, then load the page
  // as many times as the cap. Under the old eager-creation path this loop
  // alone destroyed every one of them.
  const seeded = seedSessions(api, cap);
  const oldestId = seeded[seeded.length - 1].id;

  for (let i = 0; i < cap; i++) simulatePageLoad(api, env);

  const after = api.loadAiSessions();
  check(`${cap} page loads write no session record`, after.length === cap,
        `expected ${cap} sessions, got ${after.length}`);
  check(`${cap} page loads evict nothing (oldest conversation survives)`,
        after.some(s => s.id === oldestId),
        'the oldest message-bearing session was pushed off the end of the cap');
  check('a fresh load leaves no current-session pointer',
        env.localStorage.getItem('dc-current-session') === null);
  check('a fresh load opens an empty conversation',
        api.getCurrentSession() === null);
}

/* ── 2. The first sent message creates exactly one record ────────────────── */
{
  const env = makeEnv();
  const api = build(env);
  seedSessions(api, 3);
  simulatePageLoad(api, env);

  check('no record exists before the first message', api.loadAiSessions().length === 3);

  api.addMessageToSession('user', 'how do I check open ports');
  const afterUser = api.loadAiSessions();
  check('the first message creates exactly one record', afterUser.length === 4,
        `expected 4 sessions, got ${afterUser.length}`);
  check('the new record is newest-first', afterUser[0].messages.length === 1);
  check('the summary is taken from the first user message',
        afterUser[0].summary === 'how do I check open ports');

  api.addMessageToSession('assistant', 'use ss -tlnp');
  api.addMessageToSession('user', 'and on windows?');
  const afterMore = api.loadAiSessions();
  check('later messages reuse the same record, they do not create new ones',
        afterMore.length === 4, `expected 4 sessions, got ${afterMore.length}`);
  check('all three messages landed in the current session',
        afterMore[0].messages.length === 3);
  check('the summary is not overwritten by the second user message',
        afterMore[0].summary === 'how do I check open ports');
}

/* ── 3. Nothing becomes unreachable: the sidebar still lists and restores ── */
{
  const env = makeEnv();
  const api = build(env);
  const seeded = seedSessions(api, 5);
  simulatePageLoad(api, env);

  api.renderSessionList();
  const html = env.sidebar.innerHTML;

  const listed = seeded.filter(s => html.includes(`switchSession(${s.id})`));
  check('the sidebar lists every past session after a fresh load',
        listed.length === seeded.length,
        `only ${listed.length} of ${seeded.length} sessions rendered`);
  check('no session is marked active on a fresh load',
        !html.includes('session-item active'));
  check('the empty-state placeholder is not shown when sessions exist',
        !html.includes('session-empty'));

  // switchSession() itself is DOM-heavy (bubble replay), but the state it
  // reads is exactly this: pointer -> record -> messages. Assert the restore
  // is intact at that level.
  const target = seeded[3];
  env.localStorage.setItem('dc-current-session', String(target.id));
  const restored = api.getCurrentSession();
  check('switching to a past session restores it',
        restored && restored.id === target.id);
  check('the restored session still has all its messages',
        restored && restored.messages.length === 2);
  check('the restored session still has its mode and language',
        restored && restored.modes[0] === 'search' && restored.language === 'en');
}

/* ── 4. pruneEmptySessions() removes only empty shells ───────────────────── */
{
  const env = makeEnv();
  const api = build(env);
  api.saveAiSessions([
    { id: 5, modes: ['search'], language: 'en', messages: [], summary: 'New session' },
    { id: 4, modes: ['search'], language: 'en', messages: [{ role: 'user', content: 'real' }], summary: 'real' },
    { id: 3, modes: ['diagnose'], language: 'he', messages: [], summary: 'שיחה חדשה' },
    { id: 2, modes: ['search'], language: 'en', messages: [{ role: 'user', content: 'also real' }], summary: 'also real' },
  ]);

  const removed = api.pruneEmptySessions();
  const kept = api.loadAiSessions();
  check('pruning removes the empty shells', removed === 2, `removed ${removed}`);
  check('pruning keeps every session that has messages',
        kept.length === 2 && kept.every(s => s.messages.length > 0));
  check('pruning preserves newest-first order', kept[0].id === 4 && kept[1].id === 2);

  const removedAgain = api.pruneEmptySessions();
  check('pruning is idempotent', removedAgain === 0 && api.loadAiSessions().length === 2);
}

/* ── 5. The eviction the lazy design exists to prevent is real ───────────── */
// Guards the premise rather than the fix: if MAX_HISTORY_SESSIONS ever stops
// evicting (say the cap is removed), the lazy-creation comments in index.html
// become misleading and should be revisited rather than left as folklore.
{
  const env = makeEnv();
  const api = build(env);
  const cap = api.CONFIG.MAX_HISTORY_SESSIONS;
  const seeded = seedSessions(api, cap);
  const oldestId = seeded[seeded.length - 1].id;

  api.createNewSession();
  const after = api.loadAiSessions();
  check('createNewSession() still evicts the oldest session at the cap',
        after.length === cap && !after.some(s => s.id === oldestId),
        'the cap no longer evicts — re-check whether lazy creation is still necessary');
}

if (failures > 0) {
  console.error(`\n${failures} failure(s) found.`);
  process.exit(1);
}
console.log('\nOK: conversation lifecycle holds (fresh per load, lazy creation, history reachable).');
