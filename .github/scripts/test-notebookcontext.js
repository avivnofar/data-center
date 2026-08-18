#!/usr/bin/env node
// Regression test for buildNotebookContext()'s section-selection threshold
// (see automation/NEEDS_YOUR_REVIEW.md's 2026-08-15 token-budget diagnostic).
// Before this fix, a section qualified if it matched ANY single query
// token (words.some(...)) — on a VPN-comparison query, that pulled in the
// entire unrelated "Remote Access & Monitoring Tools" notebook (TeamViewer/
// AnyDesk/RustDesk) alongside the genuinely relevant VPN sections, purely
// because both notebooks' content happens to share generic words like
// "remote"/"access". The fix requires a section to match a majority of the
// query's significant words. Extracts matchNotebooks()/buildNotebookContext()
// and their dependencies verbatim from index.html and runs them against the
// real data/notebooks/ mirror — no mocked notebook content to drift out of
// sync.

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
  extractConst('NOTEBOOK_STOPWORDS_HE'),
  extractConst('HEBREW_LETTER_CLASS'),
  extractConst('HEBREW_PARTICLES'),
  extractConst('HEBREW_CHAR_RE'),
  extractFn('notebookQueryTokens'),
  extractFn('escapeRegExp'),
  extractFn('isHebrewText'),
  extractFn('hebrewStripParticles'),
  extractFn('notebookWordMatch'),
  extractFn('tokensUsableAgainst'),
  extractFn('matchNotebooks'),
  extractFn('notebookSectionMatches'),
  extractFn('fetchNotebook'),
  extractFn('buildNotebookContext'),
].join('\n');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function fakeFetch(url) {
  const body = fs.readFileSync(path.join(repoRoot, url), 'utf8');
  return { ok: true, json: async () => JSON.parse(body) };
}

const idx = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/notebooks/_index-public.json'), 'utf8'));
const DB = { notebookIndex: idx.notebooks };

const buildNotebookContext = new AsyncFunction('DB', 'fetch', `
  const notebookCache = {};
  ${fnSrc}
  return buildNotebookContext;
`)(DB, fakeFetch);

let failures = 0;

(async () => {
  const bnc = await buildNotebookContext;

  // Case 1: VPN-comparison query — the diagnosed over-attachment case.
  const vpnCtx = await bnc('what is the difference between site-to-site and remote access VPN');
  if (/TeamViewer|AnyDesk|RustDesk/.test(vpnCtx)) {
    failures++;
    console.error('FAILED: VPN query should not attach remote-desktop-tool sections (TeamViewer/AnyDesk/RustDesk)');
  }
  if (!/VPN Architectures/.test(vpnCtx)) {
    failures++;
    console.error('FAILED: VPN query should still attach the genuinely relevant "VPN Architectures" section');
  }
  if (vpnCtx.length >= 10000) {
    failures++;
    console.error(`FAILED: VPN query context should be well under the old any-match size (~14.8k chars), got ${vpnCtx.length}`);
  }
  console.log(`VPN query: ${vpnCtx.length} chars attached (old any-match behavior: ~14,841 chars)`);

  // Case 2: a query with no notebook coverage must still return no context
  // (sanity check that the majority threshold doesn't loosen the existing
  // NOTEBOOK_MATCH_MIN_SCORE notebook-level gate).
  const noneCtx = await bnc('what is a hypervisor');
  if (noneCtx !== '') {
    failures++;
    console.error(`FAILED: "what is a hypervisor" should attach no notebook context, got:\n${noneCtx}`);
  }

  /* ── Hebrew queries against an English-only mirror (2026-08-18) ─────────
   * The mirrored notebooks are Notebook-X's own content, verbatim, and it is
   * English prose — measured at fix time: 0 Hebrew characters across all 12
   * notebooks and the index. So the deliberate design (B3) is:
   *   - Hebrew tokens reach the BILINGUAL command DB (desc_he/scenarios_he/
   *     Hebrew keywords in tags) — see test-builddbcontext.js.
   *   - Latin tokens in a Hebrew query — product names, commands and flags,
   *     which Hebrew speakers type in English anyway — reach the notebooks.
   *   - A Hebrew query with NO Latin token reaches no notebook at all. That
   *     is a documented limit, not a bug: closing it needs translation, which
   *     was explicitly out of scope.
   * tokensUsableAgainst() is what makes the middle case work: without it the
   * majority threshold counts Hebrew tokens that cannot possibly match
   * English prose, and a mixed query attaches nothing.
   */
  const mirrorHasHebrew = fs.readdirSync(path.join(repoRoot, 'data/notebooks'))
    .some(f => /[\u0590-\u05FF]/.test(fs.readFileSync(path.join(repoRoot, 'data/notebooks', f), 'utf8')));
  if (mirrorHasHebrew) {
    console.log('NOTE: the notebook mirror now contains Hebrew text. tokensUsableAgainst() will start counting Hebrew tokens against it — re-measure the pure-Hebrew case below, which is pinned as a known limit on the assumption the mirror is English-only.');
  }

  // Mixed Hebrew/English: the Latin token carries the match, and the Hebrew
  // tokens must not drag the section-majority threshold out of reach.
  const mixedCtx = await bnc('שירות systemd לא עולה');
  if (mixedCtx.length < 1000) {
    failures++;
    console.error(`FAILED: mixed he/en query "שירות systemd לא עולה" should attach notebook context via its Latin token, got ${mixedCtx.length} chars`);
  }
  if (!/systemd/i.test(mixedCtx)) {
    failures++;
    console.error('FAILED: mixed he/en query should attach systemd content');
  }
  console.log(`mixed he/en query: ${mixedCtx.length} chars attached`);

  // Pure Hebrew, no Latin token: pinned as a known limit (see above).
  if (!mirrorHasHebrew) {
    const pureHeCtx = await bnc('בעיות חיבור ברשת פרטית וירטואלית');
    if (pureHeCtx !== '') {
      failures++;
      console.error(`FAILED: a pure-Hebrew query is expected to attach no notebook context while the mirror is English-only — if that changed deliberately, update this assertion and CURRENT-SPEC.md's documented limit. Got ${pureHeCtx.length} chars`);
    }
    console.log('pure-Hebrew query: 0 chars attached (documented limit — the mirror is English-only)');
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s) found.`);
    process.exit(1);
  }
  console.log('OK: buildNotebookContext() majority-match threshold and Hebrew/English token handling hold.');
})();
