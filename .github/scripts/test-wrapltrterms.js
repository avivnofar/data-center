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
