#!/usr/bin/env node
// Regression test for wrapLtrTerms()'s "no double-wrap" property: text
// already wrapped in an LTR span must never get wrapped a second time by
// another pattern. Extracts the function verbatim from index.html (no
// duplicated logic to drift out of sync) and runs it against realistic
// mixed Hebrew/English strings — see CLAUDE.md's RTL testing note (flag,
// path, IP, version number) plus English-flow cases.

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '../../index.html');
const src = fs.readFileSync(indexPath, 'utf8');

const startIdx = src.indexOf('function wrapLtrTerms(segment) {');
if (startIdx === -1) {
  console.error('FAILED: could not find wrapLtrTerms() in index.html');
  process.exit(1);
}
// Brace-match from the opening '{' — the body has nested blocks
// (if (isHebrew) { ... }), so a naive regex up to the first '}' is wrong.
let depth = 0, endIdx = -1;
for (let i = startIdx; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') {
    depth--;
    if (depth === 0) { endIdx = i + 1; break; }
  }
}
if (endIdx === -1) {
  console.error('FAILED: could not brace-match wrapLtrTerms() in index.html');
  process.exit(1);
}
const fnSrc = src.slice(startIdx, endIdx);

function wrapLtrTermsFor(lang) {
  return new Function('LANG', `${fnSrc}\nreturn wrapLtrTerms;`)(lang);
}

const cases = [
  'בדוק את השרת עם -n בנתיב /var/log/syslog בכתובת 192.168.1.1 גרסה 8.0.1',
  'תקן את הבעיה ב-192.168.1.100:8080 עם path C:\\Windows\\System32\\drivers ותראה docs',
  'The server at 192.168.1.1 uses config version 2.4.1 with flag -n and path /etc/nginx.conf',
  'עדכן ל-v2.4.1 ובדוק https://example.com/path?x=1 עם -v ו-C:\\temp\\file.txt',
  'רץ netstat -tulpn על 10.0.0.256:9999 ואז בדוק /var/log/nginx/error.log גרסה 1.2',
];

// A "double-wrap" is a second dir="ltr" span opening before a prior one
// closes — i.e. wrapped output nested inside wrapped output.
const NESTED_SPAN = /<span dir="ltr"[^>]*>[^<]*<span dir="ltr"/;

let failures = 0;
for (const lang of ['he', 'en']) {
  const wrap = wrapLtrTermsFor(lang);
  for (const c of cases) {
    const out = wrap(c);
    if (NESTED_SPAN.test(out)) {
      failures++;
      console.error(`FAILED [${lang}]: double-wrap in output for input: ${c}`);
      console.error(`  -> ${out}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} double-wrap failure(s) found.`);
  process.exit(1);
}
console.log(`OK: no double-wrap across ${cases.length * 2} he/en test cases.`);

// ── Bug 1: HTML entities must survive intact, never split ──────────────────
// wrapLtrTerms() runs on already-escHtml()'d text. In Hebrew mode its
// bare-word pattern used to treat the letters inside "&quot;"/"&amp;"/"&lt;"/
// "&gt;" as a standalone English word and wrap just that word, separating
// the "&" from the rest so the browser could no longer decode the entity.
// Each case here embeds an already-escaped entity in Hebrew prose; the fix
// must hand every one back byte-for-byte unwrapped.
const ENTITY_CASES = [
  { entity: '&quot;', text: 'היא אמרה &quot;שלום&quot; לו' },
  { entity: '&amp;', text: 'חברת Q&amp;A עובדת טוב' },
  { entity: '&lt;', text: 'אם x &lt; y אז תעצור' },
  { entity: '&gt;', text: 'אם x &gt; y אז תעצור' },
  { entity: '&#39;', text: 'זה &#39;מצוין&#39; כך' },
];
// A split entity looks like "&<span ...>quot</span>;" (or any other
// entity name/number torn apart by a wrapping span) — i.e. the literal "&"
// is no longer immediately followed by the rest of the entity text.
const SPLIT_ENTITY = /&<span/;

let entityFailures = 0;
for (const lang of ['he', 'en']) {
  const wrap = wrapLtrTermsFor(lang);
  for (const { entity, text } of ENTITY_CASES) {
    const out = wrap(text);
    if (!out.includes(entity)) {
      entityFailures++;
      console.error(`FAILED [${lang}]: entity ${entity} not intact in output for input: ${text}`);
      console.error(`  -> ${out}`);
    }
    if (SPLIT_ENTITY.test(out)) {
      entityFailures++;
      console.error(`FAILED [${lang}]: entity split by a wrapping span for input: ${text}`);
      console.error(`  -> ${out}`);
    }
  }
}

if (entityFailures > 0) {
  console.error(`\n${entityFailures} entity-splitting failure(s) found.`);
  process.exit(1);
}
console.log(`OK: HTML entities survive intact across ${ENTITY_CASES.length * 2} he/en test cases.`);

// ── Bug 2: Hebrew-prefixed LTR terms must wrap as one whole unit ───────────
// Hebrew's one-letter particles (ו/ה/ב/ל/מ/ש/כ, "and/the/in/to/from/that/
// as") glue directly onto a following LTR term with a "-" join (CLAUDE.md
// rule 4), so a term immediately after "<particle>-" has no space before
// it. The path/flag patterns used to require a space (or start-of-string/
// open-paren) immediately before the term, so a glued particle prefix made
// them fail to match at all — the term then fell apart into whatever
// smaller fragments the other patterns (or nothing, for bare separators
// like "\" and ":") could pick up. Every case here must produce exactly one
// LTR span wrapping the whole term, with the Hebrew particle and its
// joining "-" left outside the span.
const HEBREW_PARTICLES_TEST = ['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ'];
// term: the LTR text that must end up as one span. glued: true means the
// input is "<particle><term>" with no extra "-" — for flags, the flag's own
// leading "-" doubles as the join (real usage like "עם הדגל -n" glued as
// "ה-n"), so a second glue hyphen would be a double-dash that never occurs.
const PREFIX_TERM_CASES = [
  { label: 'windows path', term: 'C:\\temp\\file.txt' },
  { label: 'posix path', term: '/var/log/syslog' },
  { label: 'ip', term: '192.168.1.1' },
  { label: 'version', term: '8.0.1' },
  { label: 'flag', term: '-n', glued: true },
];

let prefixFailures = 0;
const heWrap = wrapLtrTermsFor('he');
for (const { label, term, glued } of PREFIX_TERM_CASES) {
  for (const particle of HEBREW_PARTICLES_TEST) {
    const input = glued
      ? `בדוק ${particle}${term} עכשיו`
      : `בדוק ${particle}-${term} עכשיו`;
    const out = heWrap(input);
    const expected = `<span dir="ltr" style="unicode-bidi:isolate">${term}</span>`;
    if (!out.includes(expected)) {
      prefixFailures++;
      console.error(`FAILED [he/${label}/particle=${particle}]: term not wrapped as one unit for input: ${input}`);
      console.error(`  -> ${out}`);
    }
  }
}

// English must never trigger the Hebrew-particle boundary — no regression
// check for a plain paren/space-prefixed term in English flow.
const enWrap = wrapLtrTermsFor('en');
const enOut = enWrap('The server at 192.168.1.1 uses config version 2.4.1 with flag -n and path /etc/nginx.conf and C:\\temp\\file.txt');
for (const term of ['192.168.1.1', '-n', '/etc/nginx.conf', 'C:\\temp\\file.txt']) {
  const expected = `<span dir="ltr" style="unicode-bidi:isolate">${term}</span>`;
  if (!enOut.includes(expected)) {
    prefixFailures++;
    console.error(`FAILED [en/regression]: term "${term}" not wrapped as one unit`);
    console.error(`  -> ${enOut}`);
  }
}

if (prefixFailures > 0) {
  console.error(`\n${prefixFailures} Hebrew-prefixed-term failure(s) found.`);
  process.exit(1);
}
console.log(`OK: Hebrew-particle-prefixed terms wrap as one unit across ${PREFIX_TERM_CASES.length * HEBREW_PARTICLES_TEST.length} cases, no English regression.`);
