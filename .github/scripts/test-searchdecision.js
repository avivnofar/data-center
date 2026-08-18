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
//
// Updated 2026-08-18 for the Hebrew matching fix: the rule no longer has a
// Hebrew carve-out, because the matchers now tokenize Hebrew and score it
// against the bilingual DB fields. Hebrew queries go through the same two
// signals as English ones and are pinned here alongside them.

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
  extractConst('NOTEBOOKS_ENABLED'), // retrieval allowlist matchNotebooks() gates on
  extractConst('NOTEBOOK_STOPWORDS'),
  extractConst('NOTEBOOK_STOPWORDS_HE'),
  extractConst('HEBREW_LETTER_CLASS'),
  extractConst('HEBREW_PARTICLES'),
  extractConst('HEBREW_CHAR_RE'),
  extractConst('SEARCH_THIN_CONTEXT_CHARS'),
  extractConst('SEARCH_RECENCY_TERMS_EN'),
  extractConst('SEARCH_RECENCY_TERMS_HE'),
  extractConst('SEARCH_RECENCY_RE_EN'),
  extractFn('notebookQueryTokens'),
  extractFn('escapeRegExp'),
  extractFn('isHebrewText'),
  extractFn('hebrewStripParticles'),
  extractFn('notebookWordMatch'),
  extractFn('tokensUsableAgainst'),
  extractFn('matchNotebooks'),
  extractFn('notebookSectionMatches'),
  extractFn('isoDay'),
  extractFn('notebookDateSuffix'),
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

  // ── Resolved 2026-08-18, and this entry records the resolution. This case
  //    used to expect FALSE, with the comment "if buildDbContext() ever moves
  //    to word-boundary matching, this case flips to true and should". It
  //    did, and it has. buildDbContext() used to match by substring, so "cap"
  //    hit "Capture"/"capacity" and this question read as 442 chars of
  //    coverage it did not have; it now attaches 0 and is correctly treated
  //    as genuinely uncovered.
  { q: 'explain the CAP theorem', expect: true, why: 'genuinely uncovered — "cap" no longer false-matches "Capture"' },

  // ── Hebrew. LANG only sets the response language; the rule reads the raw
  //    query in both languages, because Hebrew questions routinely carry
  //    English technical terms.
  //
  //    Until 2026-08-18 shouldAllowWebSearch() had a Hebrew carve-out —
  //    "no tokens, so the matcher couldn't look, so don't treat 0 chars as
  //    thin" — because notebookQueryTokens() kept [a-z0-9_-] only and a
  //    Hebrew query always produced 0 tokens and 0 context. The tokenizer is
  //    Unicode-aware now and buildDbContext() searches the Hebrew fields, so
  //    Hebrew queries produce real context, the carve-out is gone, and these
  //    cases are decided by exactly the same two signals as the English ones.
  //    The measured post-fix sizes are in the "ctx=" column of this script's
  //    output; the covered/uncovered gap in Hebrew (240 -> 366 chars) is what
  //    SEARCH_THIN_CONTEXT_CHARS = 300 now sits inside. ──
  { q: 'מה הגרסה האחרונה של nginx', expect: true, why: 'Hebrew recency signal' },
  { q: 'האם יצאה מהדורה חדשה של debian', expect: true, why: 'Hebrew recency signal' },
  { q: 'איך מנפים systemd service שנכשל', expect: false, why: 'notebook coverage via the English term' },

  // Pure Hebrew, no recency, real local coverage — the whole point of the fix.
  // Every one of these returned 0 chars and was force-decided by the carve-out
  // before 2026-08-18.
  { q: 'איך בודקים איזה פורט תפוס', expect: false, why: 'Hebrew DB coverage (414 chars)' },
  { q: 'בעיות חיבור ברשת פרטית וירטואלית', expect: false, why: 'Hebrew DB coverage (366 chars)' },
  { q: 'איך מגדירים חומת אש בלינוקס', expect: false, why: 'Hebrew DB coverage (410 chars)' },
  { q: 'השרת שלי איטי מה כדאי לבדוק', expect: false, why: 'Hebrew DB coverage (407 chars)' },
  { q: 'שירות systemd לא עולה', expect: false, why: 'Hebrew DB + notebook coverage via the Latin token' },

  // Pure Hebrew with genuinely no coverage — must now behave like its English
  // twin "what is a hypervisor" rather than being forced to false.
  { q: 'מה זה היפרוויזר', expect: true, why: 'thin local context (0 chars), Hebrew' },
  // Thin-but-not-empty: only two short DB entries match, because Hebrew plural
  // "פורטים" does not reach the singular "פורט" (suffixes are deliberately not
  // stemmed — see notebookWordMatch()'s comment). 240 chars, under the
  // threshold, so search is allowed. Pinned as the borderline case that shows
  // where 300 actually bites in Hebrew.
  { q: 'איך בודקים פורטים פתוחים', expect: true, why: 'thin Hebrew context (240 chars) — under the threshold' },
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
