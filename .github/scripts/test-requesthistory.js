#!/usr/bin/env node
// Regression test for the mode-aware request-history cap — Part B of the
// 2026-08-18 conversation-lifecycle change in index.html.
//
// WHAT IS BEING PROTECTED
// -----------------------
// The conversation is stateless on the server, so every turn re-sends all
// prior turns as UNCACHED input tokens — they sit after the cached prefix and
// are billed in full each time. A 26-message thread measured 11,431 uncached
// input tokens on a single question. trimMessagesForRequest() bounds what
// goes into the /api/chat request body.
//
// It bounds the PAYLOAD, not the display: the chat area and dc-sessions keep
// the whole thread. This test only ever asserts on what would be sent.
//
// Two failure directions, both silent, and both asserted here:
//   - Trimming too little: the cost regression comes straight back, with no
//     error and no visible symptom.
//   - Trimming diagnose: Solve a Case breaks in a way that looks like the
//     model "forgetting" rather than like a bug — the diagnostic thread IS
//     the product, so the model must still see the symptom from turn one and
//     every command output pasted since.
// Plus the structural invariant: never cut mid-exchange. A trimmed array must
// start with a `user` message, or the model receives an assistant turn whose
// question is gone (and the API rejects a leading assistant role outright).
//
// The function and its limits are extracted verbatim from index.html — no
// reimplementation to drift out of sync with what the browser executes.

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

function extractConst(name) {
  const m = src.match(new RegExp(`const ${name} = [^;]+;`));
  if (!m) {
    console.error(`FAILED: could not find const ${name} in index.html`);
    process.exit(1);
  }
  return m[0];
}

const { trimMessagesForRequest, REQUEST_HISTORY_TURNS } = new Function(`
  ${extractConst('REQUEST_HISTORY_TURNS')}
  ${extractFn('trimMessagesForRequest')}
  return { trimMessagesForRequest, REQUEST_HISTORY_TURNS };
`)();

let failures = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`ok    ${label}`); return; }
  failures++;
  console.error(`FAILED: ${label}${detail ? ` — ${detail}` : ''}`);
}

/* Builds a thread of `turns` complete user+assistant exchanges, then appends
   the user message currently being sent — which is exactly the shape
   sendAiMessage() passes in, since it calls addMessageToSession('user', ...)
   before assembling the request. */
function thread(turns, { trailingUser = true } = {}) {
  const msgs = [];
  for (let i = 1; i <= turns; i++) {
    msgs.push({ role: 'user', content: `Q${i}` });
    msgs.push({ role: 'assistant', content: `A${i}` });
  }
  if (trailingUser) msgs.push({ role: 'user', content: `Q${turns + 1}` });
  return msgs;
}

const userTurns = (m) => m.filter(x => x.role === 'user').length;
const contents = (m) => m.map(x => x.content);

/* ── 1. Short threads are passed through untouched, in both modes ─────────── */
for (const mode of ['search', 'diagnose']) {
  const t = thread(2);                       // Q1 A1 Q2 A2 Q3
  const out = trimMessagesForRequest(t, mode);
  check(`${mode}: a short thread is sent whole`, out.length === t.length,
        `sent ${out.length} of ${t.length} messages`);
  check(`${mode}: a short thread keeps turn one`, out[0].content === 'Q1');
}

check('an empty thread is handled', trimMessagesForRequest([], 'search').length === 0);
check('a single first question is handled',
      trimMessagesForRequest([{ role: 'user', content: 'Q1' }], 'search').length === 1);

/* ── 2. Free Search: the cap actually bites, at the documented number ─────── */
{
  const limit = REQUEST_HISTORY_TURNS.search;
  check('the search cap is 6 user turns', limit === 6, `REQUEST_HISTORY_TURNS.search = ${limit}`);

  // The boundary: exactly `limit` user turns must still be sent whole.
  const atLimit = thread(limit - 1);          // limit-1 exchanges + the new question
  check(`search: ${limit} user turns is not yet trimmed`,
        userTurns(atLimit) === limit && trimMessagesForRequest(atLimit, 'search').length === atLimit.length);

  // One turn past it: exactly one exchange drops off the oldest end.
  const overBy1 = thread(limit);              // limit exchanges + the new question
  const out1 = trimMessagesForRequest(overBy1, 'search');
  check(`search: ${limit + 1} user turns drops exactly the oldest exchange`,
        userTurns(out1) === limit && out1[0].content === 'Q2',
        `got ${userTurns(out1)} user turns starting at ${out1[0].content}`);
  check('search: the current question is always kept',
        out1[out1.length - 1].content === `Q${limit + 1}`);
  check('search: Q1 and A1 are both gone, not just Q1',
        !contents(out1).includes('Q1') && !contents(out1).includes('A1'));

  // The case that motivated the change.
  const long = thread(25);                    // 51 messages, ~the measured thread
  const outLong = trimMessagesForRequest(long, 'search');
  check(`search: a 26-user-turn thread is cut to ${limit} turns`,
        userTurns(outLong) === limit, `got ${userTurns(outLong)}`);
  check('search: the long thread sends 11 of 51 messages',
        outLong.length === 11 && long.length === 51,
        `sent ${outLong.length} of ${long.length}`);
}

/* ── 3. Solve a Case: turn one survives a realistic diagnostic thread ─────── */
{
  const limit = REQUEST_HISTORY_TURNS.diagnose;
  check('the diagnose cap is far above the search cap',
        limit >= REQUEST_HISTORY_TURNS.search * 5,
        `diagnose=${limit}, search=${REQUEST_HISTORY_TURNS.search} — diagnose must stay generous, the thread is the product`);

  // The guided flow is ~5 steps; 10 is already a long real session. The model
  // must still see the symptom stated in turn one.
  const t = thread(10);
  const out = trimMessagesForRequest(t, 'diagnose');
  check('diagnose: a 10-exchange case is sent whole', out.length === t.length,
        `sent ${out.length} of ${t.length}`);
  check('diagnose: turn one (the symptom) is still in the payload',
        out[0].content === 'Q1');
  check('diagnose: every command output gathered along the way is still there',
        contents(out).filter(c => c.startsWith('A')).length === 10);

  // Same thread, search mode: proves the asymmetry is real and not accidental.
  const asSearch = trimMessagesForRequest(t, 'search');
  check('diagnose keeps strictly more than search on the same thread',
        asSearch.length < out.length,
        'the two modes trimmed identically — the mode-awareness is not wired up');

  // The runaway guard does still exist.
  const runaway = thread(limit + 5);
  check(`diagnose: the ${limit}-turn runaway guard still applies`,
        userTurns(trimMessagesForRequest(runaway, 'diagnose')) === limit);
}

/* ── 4. Never cut mid-exchange ───────────────────────────────────────────── */
{
  // Sweep every thread length across both modes rather than spot-checking:
  // the invariant is structural, and an off-by-one that only shows at one
  // length is exactly the kind of bug a spot check misses.
  let bad = 0;
  for (const mode of ['search', 'diagnose']) {
    for (let n = 0; n <= 30; n++) {
      for (const trailingUser of [true, false]) {
        const out = trimMessagesForRequest(thread(n, { trailingUser }), mode);
        if (out.length && out[0].role !== 'user') bad++;
      }
    }
  }
  check('every trimmed payload starts with a user message', bad === 0,
        `${bad} thread length(s) produced a payload starting with an assistant turn`);

  // Trimming must preserve order and content verbatim — it is a slice, not a
  // summarisation or a rewrite.
  const t = thread(20);
  const out = trimMessagesForRequest(t, 'search');
  const tail = t.slice(t.length - out.length);
  check('the payload is a verbatim contiguous tail of the thread',
        JSON.stringify(out) === JSON.stringify(tail));
}

/* ── 5. An unknown mode falls back to the safe (cheap) cap ───────────────── */
{
  const t = thread(25);
  check('an unrecognised mode falls back to the search cap',
        userTurns(trimMessagesForRequest(t, 'cli')) === REQUEST_HISTORY_TURNS.search);
  check('a missing mode falls back to the search cap',
        userTurns(trimMessagesForRequest(t, undefined)) === REQUEST_HISTORY_TURNS.search);
}

/* ── 6. CLI Mode reaches the Worker as backend mode `search` ─────────────── */
// Not a property of trimMessagesForRequest() — a property of the call site
// that decides which cap CLI Mode gets. CLI has no cap of its own on purpose:
// getAiBackendMode() only ever returns 'search'|'diagnose', so unmatched CLI
// input is sent as 'search' and inherits that cap. If getAiBackendMode() ever
// learns a third value, this test is where that has to be reconsidered.
{
  const fn = extractFn('getAiBackendMode');
  const returns = (fn.match(/'(search|diagnose|cli)'/g) || []);
  check("getAiBackendMode() still only returns 'search' or 'diagnose'",
        returns.length > 0 && !returns.includes("'cli'"),
        `found ${returns.join(', ')} — CLI Mode may now need its own cap`);
  check('sendAiMessage() trims before calling streamFromWorker()',
        /trimMessagesForRequest\(/.test(extractFn('sendAiMessage')),
        'the cap is defined but not applied at the call site');
}

if (failures > 0) {
  console.error(`\n${failures} failure(s) found.`);
  process.exit(1);
}
console.log(`\nOK: request history cap holds (search=${REQUEST_HISTORY_TURNS.search}, diagnose=${REQUEST_HISTORY_TURNS.diagnose} user turns; payload only).`);
