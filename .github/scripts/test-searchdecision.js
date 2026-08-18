#!/usr/bin/env node
// Regression test for the web-search gating rule (shouldAllowWebSearch() /
// hasRecencySignal() in index.html, added 2026-08-18). The Worker only
// attaches the Anthropic web_search tool when the client sends
// allow_web_search: true — that tool bills $10/1,000 searches AND its
// definition sits inside the cached prefix on every request (~7,257 of the
// measured 9,812 tokens), so a wrong decision here is a real cost or a real
// quality regression, not a cosmetic one.
//
// Extracts the decision functions (and their buildDbContext()/
// buildNotebookContext() dependencies) verbatim from index.html and runs them
// against the real data/*.json + data/notebooks/ mirror — no mocked data to
// drift out of sync with what the browser actually sends.

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');
const indexPath = path.join(repoRoot, 'index.html');
const src = fs.readFileSync(indexPath, 'utf8');

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
  const asyncIdx = src.indexOf(`async function ${name}(`);
  const startIdx = asyncIdx !== -1 ? asyncIdx : src.indexOf(`function ${name}(`);
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

const fnSrc = [
  extractConst('NOTEBOOK_CONTEXT_MAX_CHARS'),
  extractConst('NOTEBOOK_MATCH_MIN_SCORE'),
  extractConst('NOTEBOOK_STOPWORDS'),
  extractConst('SEARCH_THIN_CONTEXT_CHARS'),
  extractConst('SEARCH_RECENCY_TERMS_EN'),
  extractConst('SEARCH_RECENCY_TERMS_HE'),
  extractConst('SEARCH_RECENCY_RE_EN'),
  extractFn('notebookQueryTokens'),
  extractFn('escapeRegExp'),
  extractFn('notebookWordMatch'),
  extractFn('matchNotebooks'),
  extractFn('notebookSectionMatches'),
  extractFn('fetchNotebook'),
  extractFn('buildNotebookContext'),
  extractFn('buildDbContext'),
  extractFn('hasRecencySignal'),
  extractFn('shouldAllowWebSearch'),
].join('\n');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function fakeFetch(url) {
  const body = fs.readFileSync(path.join(repoRoot, url), 'utf8');
  return { ok: true, json: async () => JSON.parse(body) };
}

const idx = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/notebooks/_index-public.json'), 'utf8'));
const DB = {
  notebookIndex: idx.notebooks,
  linux: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/linux.json'), 'utf8')),
  cmd: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/cmd.json'), 'utf8')),
  network: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/network.json'), 'utf8')),
};

const api = new AsyncFunction('DB', 'fetch', `
  const notebookCache = {};
  ${fnSrc}
  return { buildDbContext, buildNotebookContext, shouldAllowWebSearch, hasRecencySignal, SEARCH_THIN_CONTEXT_CHARS };
`)(DB, fakeFetch);

let failures = 0;

// Expected decision per query. "why" is the signal that should drive it —
// recorded so a future change that gets the right answer for the wrong reason
// is still visible in the output.
const CASES = [
  // ── KB-answerable: the local command DB covers these, no recency angle. ──
  { q: 'how do I check open ports with netstat', expect: false, why: 'local DB coverage' },
  { q: 'how do I see which process is listening on port 443 in linux', expect: false, why: 'local DB + notebook coverage' },
  { q: 'my server is slow what should I check', expect: false, why: 'local DB coverage' },

  // ── Notebook-answerable: the mirrored notebooks carry the answer. ──
  { q: 'what is the difference between site-to-site and remote access VPN', expect: false, why: 'notebook coverage' },
  { q: 'how do I configure a firewall with iptables', expect: false, why: 'notebook coverage' },
  { q: 'systemd service failed to start how do I debug', expect: false, why: 'notebook coverage' },

  // ── Recency-requiring: exactly what web_search is kept for. ──
  { q: 'what is the latest stable nginx version', expect: true, why: 'recency signal' },
  { q: 'is CVE-2026-11045 patched in ubuntu yet', expect: true, why: 'recency signal' },
  { q: 'is telnet still installed by default on ubuntu', expect: true, why: 'recency signal' },
  { q: 'read the openssh release changelog for me', expect: true, why: 'recency signal' },

  // ── Generic / uncovered: nothing local matches at all. ──
  { q: 'what is a hypervisor', expect: true, why: 'thin local context (0 chars)' },
  { q: 'what are microservices', expect: true, why: 'thin local context (0 chars)' },

  // ── Known limit, pinned deliberately rather than papered over: a generic
  //    theory question can still clear the threshold on db_context noise,
  //    because buildDbContext() matches by substring — "cap" hits "Capture"
  //    and "capacity", so this attaches tcpdump/top/systeminfo and reads as
  //    442 chars of "coverage". No search for it. That is an acceptable
  //    outcome (the model answers CAP theorem unaided, and the recency signal
  //    still overrides), but it is the honest reason the threshold is not
  //    presented as a relevance measure. If buildDbContext() ever moves to
  //    word-boundary matching, this case flips to true and should.
  { q: 'explain the CAP theorem', expect: false, why: 'db_context substring noise clears the threshold' },

  // ── Hebrew. LANG only sets the response language; the rule reads the raw
  //    query in both languages, because Hebrew questions routinely carry
  //    English technical terms (and are the only reason the tokenizer, which
  //    keeps [a-z0-9_-] only, sees anything at all on a Hebrew query). ──
  { q: 'מה הגרסה האחרונה של nginx', expect: true, why: 'Hebrew recency signal' },
  { q: 'האם יצאה מהדורה חדשה של debian', expect: true, why: 'Hebrew recency signal' },
  { q: 'איך מנפים systemd service שנכשל', expect: false, why: 'notebook coverage via the English term' },
  // Pure Hebrew, no recency: the matchers cannot tokenize it at all, so the
  // thin-context signal is deliberately NOT used (it would be true for every
  // Hebrew query, and Hebrew is the default language).
  { q: 'איך בודקים פורטים פתוחים', expect: false, why: 'no ASCII tokens, no recency signal' },
];

// Recency-keyword cases that must NOT fire — the English terms are matched on
// word boundaries precisely so these stay false.
const NON_RECENCY = [
  'how do I do a conversion between two file formats',   // "version" inside "conversion"
  'how do I distill a large log file',                   // "still" inside "distill"
];

// Known false positives, pinned on purpose. "release" is a recency term as a
// noun ("the latest nginx release") and a plain verb in IT usage ("release a
// lock", "ipconfig /release"), and word-boundary matching cannot tell them
// apart. The term stays in the list because the error it causes — one request
// that carries the search tool it did not need — is the cheap direction; the
// opposite error silently answers a "what changed recently" question from
// stale training data. Asserted so the tradeoff stays visible.
const CONSERVATIVE_FALSE_POSITIVES = [
  'how do I release a lock held by a stale process',
  'how do I release and renew my IP address',
];

(async () => {
  const { buildDbContext, buildNotebookContext, shouldAllowWebSearch, hasRecencySignal, SEARCH_THIN_CONTEXT_CHARS } = await api;

  let minSize = Infinity, maxSize = 0, zeroContextCases = 0;

  for (const c of CASES) {
    const db = buildDbContext(c.q);
    const nb = await buildNotebookContext(c.q);
    const size = db.length + nb.length;
    const got = shouldAllowWebSearch(c.q, db, nb);
    const mark = got === c.expect ? 'ok  ' : 'FAIL';
    if (got !== c.expect) {
      failures++;
      console.error(`FAILED: "${c.q}" — expected allow_web_search=${c.expect} (${c.why}), got ${got} (context ${size} chars)`);
    }
    console.log(`${mark} allow=${String(got).padEnd(5)} ctx=${String(size).padStart(6)}  ${c.q}`);
    minSize = Math.min(minSize, size);
    maxSize = Math.max(maxSize, size);
    if (size === 0) zeroContextCases++;
  }

  for (const q of NON_RECENCY) {
    if (hasRecencySignal(q)) {
      failures++;
      console.error(`FAILED: "${q}" must not register as a recency signal (word-boundary matching)`);
    }
  }

  for (const q of CONSERVATIVE_FALSE_POSITIVES) {
    if (!hasRecencySignal(q)) {
      failures++;
      console.error(`FAILED: "${q}" is expected to fire the recency signal (documented conservative false positive) — if the term list was deliberately tightened, update this list and the comment above it`);
    }
  }

  // Drift guard. data/notebooks/ is re-synced weekly and data/*.json grows,
  // so the rule's "genuinely uncovered" branch could quietly stop existing if
  // everything starts matching something. At least one case must still
  // produce exactly 0 chars, or the thin-context signal has become dead code
  // and the threshold needs re-picking against fresh measurements.
  if (zeroContextCases === 0) {
    failures++;
    console.error('FAILED: no query in the set produces 0 chars of context any more — the thin-context branch is dead; re-measure and re-pick SEARCH_THIN_CONTEXT_CHARS');
  }
  console.log(`\nthreshold ${SEARCH_THIN_CONTEXT_CHARS} chars; context sizes observed: ${minSize}-${maxSize} chars, ${zeroContextCases} query/queries with no local match at all`);

  if (failures > 0) {
    console.error(`\n${failures} failure(s) found.`);
    process.exit(1);
  }
  console.log('OK: web-search decision rule holds.');
})();
