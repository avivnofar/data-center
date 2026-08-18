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
//
// It also PINS the NOTEBOOKS_ENABLED retrieval set (2026-08-18), so
// re-enabling a notebook that was deliberately disabled is a conscious edit
// rather than an accident. See the assertion below for the reasoning.

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
  extractConst('NOTEBOOKS_ENABLED'),
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
  extractFn('isoDay'),
  extractFn('notebookDateSuffix'),
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

const sandbox = new AsyncFunction('DB', 'fetch', `
  const notebookCache = {};
  ${fnSrc}
  return { buildNotebookContext, matchNotebooks, NOTEBOOKS_ENABLED };
`)(DB, fakeFetch);

let failures = 0;

(async () => {
  const { buildNotebookContext: bnc, matchNotebooks, NOTEBOOKS_ENABLED } = await sandbox;

  /* ── The enabled set is PINNED (2026-08-18) ──────────────────────────
   * NOTEBOOKS_ENABLED decides which mirrored notebooks may be paid for as
   * request context. Eight were disabled deliberately (public+stable content
   * the model already holds, stale fast-moving content, and two "private"
   * notebooks measured to contain nothing private) — see index.html's
   * NOTEBOOKS_ENABLED comment and audits/NOTEBOOK-VALUE-TEST.md.
   *
   * This assertion exists so re-enabling one is a DELIBERATE act: it fails
   * loudly, and whoever is re-enabling has to update this list and say why.
   * It is not a style check. Do not "fix" it by widening it to match
   * index.html without reading the reasoning first.
   *
   * NOTE: this pins RETRIEVAL, not the mirror. data/notebooks/ keeps all 12
   * notebooks and notebook-sync.yml keeps syncing them.
   */
  const EXPECTED_ENABLED = ['kb-cloud-devops', 'kb-cybersecurity', 'kb-firewall', 'kb-vpn'];
  const actualEnabled = [...NOTEBOOKS_ENABLED].sort();
  if (JSON.stringify(actualEnabled) !== JSON.stringify(EXPECTED_ENABLED)) {
    failures++;
    console.error(`FAILED: NOTEBOOKS_ENABLED changed.
  expected: ${EXPECTED_ENABLED.join(', ')}
  actual:   ${actualEnabled.join(', ')}
If this is intentional, update EXPECTED_ENABLED here AND the reasoning in index.html + CURRENT-SPEC.md.`);
  }
  const knownIds = new Set(idx.notebooks.map(n => n.id));
  [...NOTEBOOKS_ENABLED].filter(id => !knownIds.has(id)).forEach(id => {
    failures++;
    console.error(`FAILED: NOTEBOOKS_ENABLED names "${id}", which is not in the mirrored index — a typo here silently disables a notebook.`);
  });

  // A disabled notebook must never reach a request, however well it scores.
  const disabledProbes = [
    ['kb-linux', 'how do I find which process is using the most memory on a linux server'],
    ['kb-1com', 'how do I configure an IVR queue on the 1COM PBX'],
    ['kb-remote-access', 'is AnyDesk or TeamViewer better for unattended remote access'],
    ['kb-ai-tools', 'compare the leading AI chat assistants and coding assistants'],
  ];
  for (const [id, q] of disabledProbes) {
    const matched = matchNotebooks(q);
    if (matched.some(nb => nb.id === id)) {
      failures++;
      console.error(`FAILED: disabled notebook ${id} still matched query "${q}"`);
    }
  }
  console.log(`enabled set pinned: ${actualEnabled.join(', ')} (${idx.notebooks.length - actualEnabled.length} of ${idx.notebooks.length} mirrored notebooks disabled for retrieval)`);

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
  // The probe used to be "שירות systemd לא עולה", which routed through kb-linux
  // — disabled for retrieval on 2026-08-18, so it now correctly attaches
  // nothing and can no longer exercise the Hebrew/Latin token path. Re-pointed
  // at an enabled notebook; the property under test is unchanged.
  const mixedQuery = 'בעיה עם OpenVPN לא מתחבר';
  const mixedCtx = await bnc(mixedQuery);
  if (mixedCtx.length < 1000) {
    failures++;
    console.error(`FAILED: mixed he/en query "${mixedQuery}" should attach notebook context via its Latin token, got ${mixedCtx.length} chars`);
  }
  if (!/OpenVPN/i.test(mixedCtx)) {
    failures++;
    console.error('FAILED: mixed he/en query should attach OpenVPN content');
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
