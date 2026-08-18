#!/usr/bin/env node
// Regression test for the freshness dates buildNotebookContext() attaches
// (2026-08-18). Until this change the mirrored notebook sections arrived
// undated, so content last revised in June read to the model exactly like
// content revised yesterday, and the context header asserted "may be up to a
// week old" — a claim the data contradicts: section dates in the mirror span
// 2026-06-30 to 2026-08-17.
//
// Extracts the real functions from index.html and runs them against the real
// data/notebooks/ mirror, same technique as test-notebookcontext.js — no
// mocked notebook content to drift out of sync with the weekly sync.
//
// The payload-size assertion is the load-bearing one. This context was shrunk
// deliberately over two prior sessions (the majority-match threshold, the
// db_context stopword filter); dates are a small, justified addition and this
// test exists to stop them quietly becoming a large one.

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
  const a = src.indexOf(`async function ${name}(`);
  const startIdx = a !== -1 ? a : src.indexOf(`function ${name}(`);
  if (startIdx === -1) { console.error(`FAILED: could not find function ${name}() in index.html`); process.exit(1); }
  return bracematch(src, startIdx, `function ${name}()`);
}
function extractConst(name) {
  const m = src.match(new RegExp(`const ${name} = [^;]+;`));
  if (!m) { console.error(`FAILED: could not find const ${name} in index.html`); process.exit(1); }
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
  extractFn('isoDay'),
  extractFn('notebookDateSuffix'),
  extractFn('fetchNotebook'),
  extractFn('buildNotebookContext'),
].join('\n');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function fakeFetch(url) {
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(repoRoot, url), 'utf8')) };
}

const idx = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/notebooks/_index-public.json'), 'utf8'));
const DB = { notebookIndex: idx.notebooks };

const apiP = new AsyncFunction('DB', 'fetch', `
  const notebookCache = {};
  ${fnSrc}
  return { buildNotebookContext, isoDay, notebookDateSuffix, matchNotebooks };
`)(DB, fakeFetch);

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error('FAILED: ' + msg); }
}

// The queries the 2026-08-18 notebook-value measurement used
// (audits/NOTEBOOK-VALUE-TEST.md), so the size figures recorded there and the
// ones asserted here describe the same thing.
const QUERIES = [
  'how do I find which process is using the most memory on a linux server',
  'how does DNS resolution work and how do I troubleshoot a failed lookup',
  'what is the difference between site-to-site and remote access VPN',
  'how should I handle a phishing incident response investigation',
  'how do I troubleshoot SIP registration failures on the 1COM cloud PBX',
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

(async () => {
  const { buildNotebookContext, isoDay, notebookDateSuffix, matchNotebooks } = await apiP;

  /* ── isoDay(): defensive, because the mirror is external data ──────────── */
  check(isoDay('2026-08-17T05:25:13.837428Z') === '2026-08-17', 'isoDay should truncate a full ISO timestamp to the day');
  check(isoDay('2026-08-17') === '2026-08-17', 'isoDay should pass through a bare date');
  check(isoDay(undefined) === '', 'isoDay should return empty string for undefined');
  check(isoDay(null) === '', 'isoDay should return empty string for null');
  check(isoDay(12345) === '', 'isoDay should return empty string for a non-string');
  check(isoDay('last Tuesday') === '', 'isoDay should reject a non-ISO string rather than emit garbage');
  check(isoDay('') === '', 'isoDay should return empty string for empty input');

  /* ── notebookDateSuffix(): omits what it does not have ─────────────────── */
  check(notebookDateSuffix({}) === '', 'a notebook with no dates should contribute no suffix at all');
  check(
    notebookDateSuffix({ updatedAt: '2026-08-17T00:00:00Z' }) === ' [updated 2026-08-17]',
    'updatedAt alone should render as a single bracketed field'
  );
  check(
    notebookDateSuffix({ updatedAt: '2026-08-10T00:00:00Z', knowledgeBase: { lastWebVerified: '2026-07-17T00:00:00Z' } })
      === ' [updated 2026-08-10, web-verified 2026-07-17]',
    'lastWebVerified should be carried alongside updatedAt when they differ'
  );
  check(
    notebookDateSuffix({ updatedAt: '2026-08-10T00:00:00Z', knowledgeBase: { lastWebVerified: '2026-08-10T09:00:00Z' } })
      === ' [updated 2026-08-10]',
    'a lastWebVerified equal to updatedAt should not be repeated — it costs chars and says nothing'
  );

  /* ── The header must not re-assert a freshness the data contradicts ────── */
  const ctx = await buildNotebookContext(QUERIES[2]);
  check(ctx.length > 0, 'the VPN query should still attach context');
  check(
    !/up to a week old/.test(ctx),
    'the "may be up to a week old" claim must stay gone — the weekly sync bounds the age of the COPY, not of the CONTENT, and mirrored sections run back to 2026-06-30'
  );
  check(/mirrored copy/.test(ctx), 'the header should still say the material is a mirrored copy');

  /* ── Every attached heading carries a date ─────────────────────────────────
   * Scanning the output for /^### / does NOT work, and finding that out is
   * worth recording: the mirrored section CONTENT embeds its own markdown
   * headings, so the emitted context legitimately contains "### Site-to-Site
   * VPN Troubleshooting Framework" (from a section's body) sitting alongside
   * the structural "#### Site-to-Site VPN Troubleshooting Framework
   * [2026-08-10]" that buildNotebookContext() wrote. A regex over heading
   * lines cannot tell the two apart and reports false failures.
   * So the expectations are reconstructed from the real notebook JSON instead,
   * and matched exactly. Notebook headings are unambiguous because of the
   * "(domain)" they carry; section headings are checked by the inverse
   * invariant — a section that HAS a date must never appear in its undated
   * structural form.
   */
  let totalBefore = 0, totalAfter = 0, sections = 0, dated = 0;
  for (const q of QUERIES) {
    const out = await buildNotebookContext(q);
    if (!out) continue;

    for (const meta of matchNotebooks(q)) {
      const nb = JSON.parse(fs.readFileSync(path.join(repoRoot, `data/notebooks/${meta.id}.json`), 'utf8'));
      const heading = `### ${nb.name} (${nb.domain})`;
      if (!out.includes(heading)) continue; // matched at notebook level but contributed no section

      check(out.includes(heading + notebookDateSuffix(nb) + '\n'),
        `${meta.id}: notebook heading should carry its date — expected "${heading}${notebookDateSuffix(nb)}"`);
      check(ISO.test(isoDay(nb.updatedAt)),
        `${meta.id}: mirrored notebook should carry a usable updatedAt, got ${JSON.stringify(nb.updatedAt)}`);

      for (const sec of (nb.knowledgeBase && nb.knowledgeBase.sections) || []) {
        const structural = `\n#### ${sec.title}`;
        if (!out.includes(structural)) continue;
        sections++;
        const d = isoDay(sec.lastUpdated);
        if (d) {
          dated++;
          check(out.includes(`${structural} [${d}]\n`),
            `${meta.id} / "${sec.title}": section has lastUpdated ${d} but was emitted without it`);
          check(!out.includes(`${structural}\n`),
            `${meta.id} / "${sec.title}": section was emitted in its undated form despite having a date`);
        }
      }
    }

    totalAfter += out.length;
    // Reconstruct the pre-change size by stripping the bracketed dates and
    // restoring the old header, so the overhead figure is measured, not
    // assumed.
    const stripped = out
      .replace(/^NOTEBOOK-X REFERENCE SECTIONS \(mirrored copy;[^\n]*\)?:/, 'NOTEBOOK-X REFERENCE SECTIONS (mirrored, may be up to a week old):')
      .replace(/^(### .*?) \[updated [^\]]*\]$/gm, '$1')
      .replace(/^(#### .*?) \[\d{4}-\d{2}-\d{2}\]$/gm, '$1');
    totalBefore += stripped.length;
  }

  check(sections > 0, 'the sample queries should attach at least one section');
  // Every section in the current mirror carries lastUpdated (verified
  // 2026-08-18: 130/130 across all 12 notebooks). If a future sync drops the
  // field the fallback is the notebook-level date, which is why this is a
  // notice rather than a failure — but it should not go unnoticed.
  if (dated < sections) {
    console.log(`NOTE: ${sections - dated} of ${sections} emitted section headings carried no date. buildNotebookContext() falls back to the notebook-level date, which is intended — but if the mirror has started dropping lastUpdated, the per-section signal is degrading.`);
  }

  /* ── The overhead must stay small ──────────────────────────────────────── */
  const overhead = totalAfter - totalBefore;
  const pct = (overhead / totalBefore) * 100;
  console.log(`freshness dates: ${totalBefore} -> ${totalAfter} chars across ${QUERIES.length} queries (+${overhead}, +${pct.toFixed(2)}%)`);
  check(pct < 6,
    `date overhead should stay under 6% of the attached payload, measured ${pct.toFixed(2)}%. Measured at +2.47% on 2026-08-18; the ceiling is headroom for mirror drift, not a budget to spend.`);

  /* ── And must not push the payload past its own cap ────────────────────── */
  const cap = Number((src.match(/const NOTEBOOK_CONTEXT_MAX_CHARS = (\d+)/) || [])[1]);
  for (const q of QUERIES) {
    const out = await buildNotebookContext(q);
    check(out.length <= cap + 200,
      `"${q.slice(0, 40)}..." attached ${out.length} chars against a ${cap} cap — dates must be inside the budget, not on top of it`);
  }

  if (failures > 0) {
    console.error(`\n${failures} failure(s) found.`);
    process.exit(1);
  }
  console.log('OK: notebook freshness dates attach, stay compact, and the stale "a week old" claim is gone.');
})();
