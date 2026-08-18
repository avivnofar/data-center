#!/usr/bin/env node
// Regression test for the gap log (2026-08-18) — the dc-gaps localStorage
// record of queries that matched NOTHING in either the command DB or the
// Notebook-X mirror.
//
// Two things are pinned here, and the second matters more than the first.
// The first is the storage contract: shape, cap, eviction order, and the
// promise that entries stay plain JSON with no derived fields, because the
// intended consumer is Notebook-X's own (currently manual) gap list and
// anything derived now would be a guess at a consumer that does not exist.
// The second is that recordGap() is actually CALLED, and called under the
// right condition — a log that is defined but never invoked, or invoked on
// every message, is worse than no log at all, and neither failure is visible
// from unit-testing the function alone.

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
  if (endIdx === -1) { console.error(`FAILED: could not brace-match ${label}`); process.exit(1); }
  return s.slice(startIdx, endIdx);
}
function extractFn(name) {
  const startIdx = src.indexOf(`function ${name}(`);
  if (startIdx === -1) { console.error(`FAILED: could not find function ${name}() in index.html`); process.exit(1); }
  return bracematch(src, startIdx, `function ${name}()`);
}
function extractConst(name) {
  const m = src.match(new RegExp(`const ${name} = [^;]+;`));
  if (!m) { console.error(`FAILED: could not find const ${name} in index.html`); process.exit(1); }
  return m[0];
}

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('FAILED: ' + msg); }
}

/* ── A minimal localStorage that can also be made to fail on demand ──────── */
function makeStorage() {
  const store = new Map();
  return {
    failWrites: false,
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) {
      if (this.failWrites) throw new Error('QuotaExceededError');
      store.set(k, String(v));
    },
    removeItem(k) { store.delete(k); },
    _raw: store,
  };
}

function load(storage) {
  const win = {};
  const body = [
    extractConst('GAP_LOG_KEY'),
    extractConst('GAP_LOG_MAX'),
    extractFn('readGapLog'),
    extractFn('recordGap'),
    // window.dcGaps is an assignment, not a declaration — take it verbatim.
    (src.match(/window\.dcGaps = function dcGaps\(action\) \{[\s\S]*?\n\};/) || [null])[0],
  ];
  if (!body[4]) { console.error('FAILED: could not find the window.dcGaps assignment in index.html'); process.exit(1); }
  return new Function('localStorage', 'window', `
    ${body.join('\n')}
    return { readGapLog, recordGap, dcGaps: window.dcGaps, GAP_LOG_KEY, GAP_LOG_MAX };
  `)(storage, win);
}

/* ── 1. Storage shape — exactly the four fields, nothing derived ─────────── */
{
  const storage = makeStorage();
  const api = load(storage);
  api.recordGap('what is a hypervisor', 'en', 'search');

  const log = api.readGapLog();
  check(log.length === 1, `one recorded gap should produce one entry, got ${log.length}`);
  const e = log[0];
  check(e.query === 'what is a hypervisor', 'the query text should be stored verbatim');
  check(e.lang === 'en', 'LANG should be stored');
  check(e.mode === 'search', 'mode should be stored');
  check(typeof e.ts === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(e.ts), `ts should be an ISO 8601 UTC string, got ${JSON.stringify(e.ts)}`);

  const keys = Object.keys(e).sort();
  check(
    JSON.stringify(keys) === JSON.stringify(['lang', 'mode', 'query', 'ts']),
    `an entry must carry exactly query/lang/mode/ts and NO derived fields — got ${JSON.stringify(keys)}. If a field was added deliberately, update this assertion and CURRENT-SPEC.md's "Gap log" entry together; the no-derived-fields promise is what makes the log trivially exportable to Notebook-X.`
  );

  // Plain JSON, round-trippable — no Dates, no undefined, no functions.
  const raw = storage.getItem('dc-gaps');
  check(JSON.stringify(JSON.parse(raw)) === raw, 'the stored value should be canonical plain JSON');
}

/* ── 2. Hebrew and the other modes survive the round trip ────────────────── */
{
  const storage = makeStorage();
  const api = load(storage);
  api.recordGap('מה זה היפרוויזר', 'he', 'diagnose');
  api.recordGap('foo --bar', 'he', 'cli');
  const log = api.readGapLog();
  check(log[0].query === 'מה זה היפרוויזר', 'Hebrew query text should round-trip unmangled');
  check(log[0].lang === 'he' && log[0].mode === 'diagnose', 'he/diagnose should be stored as given');
  check(log[1].mode === 'cli', 'cli must be storable as a distinct mode — collapsing it into search would erase the CLI fall-through signal');
}

/* ── 3. The cap evicts the OLDEST, and keeps order ───────────────────────── */
{
  const storage = makeStorage();
  const api = load(storage);
  const max = api.GAP_LOG_MAX;
  check(max === 200, `the documented cap is 200 entries, found ${max}`);

  for (let i = 0; i < max + 50; i++) api.recordGap('query ' + i, 'en', 'search');

  const log = api.readGapLog();
  check(log.length === max, `the log should cap at ${max}, got ${log.length}`);
  check(log[0].query === 'query 50', `eviction should drop the OLDEST first — expected "query 50" at the head, got "${log[0].query}"`);
  check(log[log.length - 1].query === 'query ' + (max + 49), 'the newest entry should be at the tail');
  // Order is the export contract too: oldest-first, no re-sorting.
  for (let i = 1; i < log.length; i++) {
    if (log[i - 1].ts > log[i].ts) { check(false, 'entries should stay in chronological order'); break; }
  }
}

/* ── 4. Nothing is recorded for an empty query ───────────────────────────── */
{
  const storage = makeStorage();
  const api = load(storage);
  api.recordGap('', 'en', 'search');
  api.recordGap('   ', 'en', 'search');
  api.recordGap(null, 'en', 'search');
  api.recordGap(undefined, 'en', 'search');
  check(api.readGapLog().length === 0, 'an image-only or empty message carries no query and must not create an entry');
}

/* ── 5. The console surface: read, export, clear ─────────────────────────── */
{
  const storage = makeStorage();
  const api = load(storage);
  api.recordGap('a', 'en', 'search');
  api.recordGap('b', 'he', 'cli');

  const listed = api.dcGaps();
  check(Array.isArray(listed) && listed.length === 2, 'dcGaps() should return the array of entries');

  const json = api.dcGaps('json');
  check(typeof json === 'string', 'dcGaps("json") should return a string');
  check(JSON.stringify(JSON.parse(json)) === JSON.stringify(listed), 'dcGaps("json") should be the same data, parseable');

  const removed = api.dcGaps('clear');
  check(removed === 2, `dcGaps("clear") should return how many entries it removed, got ${removed}`);
  check(api.dcGaps().length === 0, 'dcGaps("clear") should actually empty the log');
  check(storage.getItem('dc-gaps') === null, 'clearing should remove the key, not leave an empty array behind');
  check(api.dcGaps('clear') === 0, 'clearing an already-empty log should be a no-op returning 0');
}

/* ── 6. Hostile storage must never break sending a message ───────────────── */
{
  const storage = makeStorage();
  const api = load(storage);

  storage.setItem('dc-gaps', 'not json at all');
  check(Array.isArray(api.readGapLog()) && api.readGapLog().length === 0, 'a corrupt stored value should read as an empty log, not throw');

  storage.setItem('dc-gaps', '{"not":"an array"}');
  check(api.readGapLog().length === 0, 'a non-array stored value should read as an empty log');
  // ...and recording over it should recover rather than compound the damage.
  api.recordGap('after corruption', 'en', 'search');
  check(api.readGapLog().length === 1, 'recording after corruption should reset to a valid one-entry log');

  storage.failWrites = true;
  let threw = false;
  try { api.recordGap('quota exceeded', 'en', 'search'); } catch (_) { threw = true; }
  check(!threw, 'a localStorage write failure (private mode, quota) must be swallowed — a diagnostic log must never break a chat message');
}

/* ── 7. It is actually wired up, and only on the zero-context path ───────── */
{
  // Mirrors the "request-history-capped" spec-drift claim's reasoning: a check
  // that the function EXISTS would pass on exactly the version that never
  // calls it.
  const callSite = src.match(/if \(!dbContext && !notebookContext\) recordGap\([^\n]*\);/);
  check(!!callSite, 'recordGap() must be called from sendAiMessage() guarded on BOTH contexts being empty — a log that is defined but never invoked is worse than none');
  if (callSite) {
    check(/recordGap\(text, LANG, AI_MODES\[0\]\)/.test(callSite[0]),
      `the call should pass the query text, LANG, and the USER-FACING mode (AI_MODES[0], not getAiBackendMode() — which collapses cli into search). Found: ${callSite[0]}`);
  }

  // Count real call sites only. Prose mentions of "recordGap()" in comments
  // are not call sites, so lines whose recordGap( sits after a // are skipped
  // — the point of the count is that the guard cannot be bypassed, and a
  // comment cannot bypass anything.
  const callLines = src.split('\n').filter(line => {
    const at = line.indexOf('recordGap(');
    if (at === -1) return false;
    if (/^\s*(\/\/|\*)/.test(line)) return false;          // comment line
    const slashes = line.indexOf('//');
    if (slashes !== -1 && slashes < at) return false;      // trailing comment
    return !/function recordGap\(/.test(line);             // the definition
  });
  check(callLines.length === 1,
    `recordGap() should have exactly one call site so the zero-context guard cannot be bypassed — found ${callLines.length}:\n${callLines.join('\n')}`);

  // No UI: this is diagnostic plumbing by explicit decision, and a future
  // session should have to change this assertion on purpose to add one.
  check(!/id="gap|gaps-panel|openGapsPanel|renderGapList/.test(src),
    'the gap log is deliberately console-only — no panel, button or modal. If a UI is genuinely wanted, that is an owner decision, not a drive-by addition.');
}

if (failures > 0) {
  console.error(`\n${failures} failure(s) found.`);
  process.exit(1);
}
console.log('OK: gap log stores plain JSON, caps at 200 oldest-first, survives hostile storage, and is wired to the zero-context path only.');
