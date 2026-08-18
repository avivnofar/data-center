#!/usr/bin/env node
// Regression test for buildDbContext()'s stopword/length filter (see
// CLAUDE.md's "AI Backend" / automation/NEEDS_YOUR_REVIEW.md 2026-08-15
// token-budget diagnostic). Before this fix, buildDbContext() tokenized
// with a raw split() — no stopword removal, no minimum length — so short
// common words like "a"/"is"/"how" scored every DB entry that happened to
// contain them anywhere in its description, producing 100%-irrelevant
// matches on plain-English queries. Extracts buildDbContext() (and its
// notebookQueryTokens()/NOTEBOOK_STOPWORDS dependency) verbatim from
// index.html and runs it against the real data/*.json files — no mocked
// data to drift out of sync.

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

const fnSrc = [
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
  extractFn('buildDbContext'),
].join('\n');

const DB = {
  linux: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/linux.json'), 'utf8')),
  cmd: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/cmd.json'), 'utf8')),
  network: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/network.json'), 'utf8')),
};

const { buildDbContext, notebookWordMatch, notebookQueryTokens } =
  new Function('DB', `${fnSrc}\nreturn { buildDbContext, notebookWordMatch, notebookQueryTokens };`)(DB);

let failures = 0;

// Case 1: a query with no real DB coverage, whose only pre-fix matches came
// from stopwords ("what"/"is"/"a") — must now return no context at all.
{
  const ctx = buildDbContext('what is a hypervisor');
  if (ctx !== '') {
    failures++;
    console.error(`FAILED: "what is a hypervisor" should match nothing (stopword-only matches), got:\n${ctx}`);
  }
}

// Case 2: a query with genuine DB coverage — real matches must survive the
// filter, and the specific stopword-driven false positive ("whoami",
// matched pre-fix only via "how"/"do"/"with") must not appear.
{
  const ctx = buildDbContext('how do I check open ports with netstat');
  if (!/netstat/i.test(ctx)) {
    failures++;
    console.error(`FAILED: "how do I check open ports with netstat" should still match a netstat entry, got:\n${ctx}`);
  }
  if (/whoami/i.test(ctx)) {
    failures++;
    console.error(`FAILED: "how do I check open ports with netstat" should not match "whoami" (stopword-driven false positive), got:\n${ctx}`);
  }
}

// Case 3: a query built entirely of stopwords/short words must return no
// context (no DB entry should be able to score on zero real content words).
{
  const ctx = buildDbContext('how do you do this');
  if (ctx !== '') {
    failures++;
    console.error(`FAILED: all-stopword query should match nothing, got:\n${ctx}`);
  }
}

/* ── Word-boundary matching (2026-08-18) ──────────────────────────────────
 * buildDbContext() used to score with haystack.includes(w). That made "CAP"
 * match "Capture"/"capacity" and, in Hebrew, made "שירות" (service) match
 * inside "ישירות" (directly). It now uses notebookWordMatch() — the same
 * matcher matchNotebooks() has always used — so there is one implementation,
 * not two.
 */
{
  const ctx = buildDbContext('explain the CAP theorem');
  if (ctx !== '') {
    failures++;
    console.error(`FAILED: "explain the CAP theorem" must match nothing — "cap" is not a word in "Capture"/"capacity". Got:\n${ctx}`);
  }
}

const BOUNDARY_CASES = [
  // [haystack, query word, expected, why]
  ['capture packets on the wire', 'cap', false, 'CAP must not match inside "Capture"'],
  ['disk capacity report', 'cap', false, 'CAP must not match inside "capacity"'],
  ['the cap theorem explained', 'cap', true, 'a standalone word still matches'],
  // Hebrew: \b keys off [A-Za-z0-9_] and so never fires between two Hebrew
  // letters. Hebrew words match on a Hebrew-LETTER boundary instead, with the
  // one-letter particles ו/ה/ב/ל/מ/כ/ש allowed on either side.
  ['פקודה שרצה ישירות במסוף', 'שירות', false, '"שירות" must not match inside "ישירות"'],
  ['הפעלת שירות במערכת', 'שירות', true, 'a standalone Hebrew word matches'],
  ['מדיניות הדורשת אימות', 'רשת', false, '"רשת" must not match inside "הדורשת"'],
  ['תקלות ברשת המקומית', 'רשת', true, 'the haystack carries the ב particle'],
  ['בדיקת רשת מקומית', 'ברשת', true, 'the QUERY carries the ב particle'],
  ['הגדרות וברשת הפנימית', 'רשת', true, 'stacked particles (ו+ב) on the haystack'],
];
for (const [hay, word, expected, why] of BOUNDARY_CASES) {
  const got = notebookWordMatch(hay, word);
  if (got !== expected) {
    failures++;
    console.error(`FAILED: notebookWordMatch("${hay}", "${word}") — expected ${expected} (${why}), got ${got}`);
  }
}

/* ── Hebrew reachability (2026-08-18) ─────────────────────────────────────
 * THE bug this file now guards. notebookQueryTokens() kept [a-z0-9_-] only,
 * so a query written in Hebrew — the app's DEFAULT language — tokenized to
 * [] and buildDbContext() returned '' at its !words.length guard. The whole
 * 148-entry knowledge base was unreachable in Hebrew.
 *
 * Sizes below are the measured post-fix figures against the real data/*.json.
 * They are asserted as a floor, not an exact value, so ordinary data growth
 * doesn't fail the build.
 */
const HEBREW_CASES = [
  { q: 'איך בודקים איזה פורט תפוס', min: 300, expect: /netstat/i, why: 'port/socket entries' },
  { q: 'בעיות חיבור ברשת פרטית וירטואלית', min: 300, expect: /netstat|ss|ip\b/i, why: 'network-connection entries' },
  { q: 'איך מגדירים חומת אש בלינוקס', min: 300, expect: /iptables|ufw|firewall/i, why: 'firewall entries' },
  { q: 'השרת שלי איטי מה כדאי לבדוק', min: 300, expect: /free|top|vmstat|df/i, why: 'performance entries' },
  { q: 'שירות systemd לא עולה', min: 300, expect: /systemctl|journalctl/i, why: 'mixed he/en query' },
];
for (const c of HEBREW_CASES) {
  const ctx = buildDbContext(c.q);
  if (!notebookQueryTokens(c.q).length) {
    failures++;
    console.error(`FAILED: "${c.q}" tokenizes to nothing — the tokenizer has stopped being Unicode-aware`);
    continue;
  }
  if (ctx.length < c.min) {
    failures++;
    console.error(`FAILED: "${c.q}" should attach at least ${c.min} chars of DB context (${c.why}), got ${ctx.length}`);
  }
  if (!c.expect.test(ctx)) {
    failures++;
    console.error(`FAILED: "${c.q}" should match ${c.expect} (${c.why}), got:\n${ctx}`);
  }
  console.log(`he: ${String(ctx.length).padStart(4)} chars  ${c.q}   (pre-fix: 0 — tokenizer dropped every Hebrew letter)`);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s) found.`);
  process.exit(1);
}
console.log(`OK: buildDbContext() stopword/length filter, word-boundary matching (${BOUNDARY_CASES.length} cases) and Hebrew reachability (${HEBREW_CASES.length} cases) all hold.`);
