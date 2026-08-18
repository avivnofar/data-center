#!/usr/bin/env node
// Regression test for renderMarkdown()'s guide mode (2026-08-18).
//
// The bug: workflows/*.md is repo-authored content whose Hebrew prose wraps
// English technical terms in <span class="ltr-term"> per CLAUDE.md rule 4.
// renderMarkdown() escHtml()s everything, so on the live site those tags
// rendered as visible literal text — and in Hebrew, the DEFAULT language,
// wrapLtrTerms() then tore the escaped entities apart word by word, so what
// actually reached the page was `&quot;` / `&gt;` soup with each fragment in
// its own LTR span.
//
// The fix adds an opt-in `{ allowInlineHtml: true }` used ONLY by
// openWorkflow(). This test pins both halves of that contract:
//   - guide mode honours exactly the inline tags CLAUDE.md rule 6 allows
//     (span.ltr-term, b, code) and nothing else;
//   - default mode — which is what the AI chat path uses — is unchanged and
//     still escapes everything.
//
// Extracts the real functions verbatim from index.html; no reimplementation
// to drift out of sync. Runs the real workflows/*.md files as the final case.

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

function bracematch(s, startIdx, label) {
  let depth = 0;
  for (let i = startIdx; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') { depth--; if (depth === 0) return s.slice(startIdx, i + 1); }
  }
  console.error(`FAILED: could not brace-match ${label} in index.html`);
  process.exit(1);
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

const SENT_A = String.fromCharCode(1);
const SENT_B = String.fromCharCode(2);
const SENT_RE = new RegExp('[' + SENT_A + SENT_B + ']');

const fnSrc = [
  extractConst('GUIDE_INLINE_HTML_RE'),
  extractConst('INLINE_SENTINEL_A'),
  extractConst('INLINE_SENTINEL_B'),
  extractConst('INLINE_SENTINEL_RE'),
  extractFn('escHtml'),
  extractFn('wrapLtrTerms'),
  extractFn('parseSuggestionBlocks'),
  extractFn('renderMarkdown'),
].join('\n');

function renderFor(lang) {
  return new Function('LANG', `${fnSrc}\nreturn renderMarkdown;`)(lang);
}

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.error(`FAILED: ${msg}`); }
}

/* In Hebrew, wrapLtrTerms() wraps every standalone Latin run in an LTR-isolate
 * span, so `<b>bold</b>` arrives as `<b><span dir="ltr" ...>bold</span></b>`
 * and `&lt;script&gt;` as `&<span ...>lt</span>;<span ...>script</span>...`.
 * That is existing, intended behaviour on both paths and is not what these
 * assertions are about, so strip the isolate wrappers first. They only ever
 * contain plain text (they run on segments outside code spans), so one
 * non-nesting pass is exact. Nesting an isolate inside an .ltr-term span is
 * redundant but harmless — both set the same direction.
 */
function stripLtrIsolates(html) {
  return html.replace(/<span dir="ltr" style="unicode-bidi:isolate">([^<]*)<\/span>/g, '$1');
}

for (const lang of ['he', 'en']) {
  const render = renderFor(lang);

  /* ── 1. Guide mode honours span.ltr-term ──────────────────────────────── */
  const sample = 'מסמך זה מכסה ניהול <span class="ltr-term">Linux</span> בשרת.';
  const guide = stripLtrIsolates(render(sample, { allowInlineHtml: true }).html);
  check(guide.includes('<span class="ltr-term">Linux</span>'),
    `[${lang}] guide mode should emit a real ltr-term span, got: ${guide}`);
  check(!/&lt;span|&quot;ltr-term|&gt;/.test(guide),
    `[${lang}] guide mode should leave no escaped-tag debris, got: ${guide}`);

  /* ── 2. Default mode is unchanged (the AI chat path) ──────────────────── */
  const chat = stripLtrIsolates(render(sample).html);
  check(!chat.includes('<span class="ltr-term">'),
    `[${lang}] default mode must NOT honour inline html — the AI chat path relies on full escaping`);
  check(chat.includes('&lt;span'),
    `[${lang}] default mode must still escape the tag, got: ${chat}`);

  /* ── 3. Only the rule-6 allowlist is honoured ─────────────────────────── */
  // Everything outside span.ltr-term / b / code stays escaped, in guide mode
  // too. <service> / <port> / <ip> are real: the guides use them as literal
  // placeholders inside commands, and they must print, not vanish into the DOM.
  const hostile = 'run `ssh <user>@<host>` then <script>alert(1)</script> and '
    + '<span class="evil">x</span> and <img src=x onerror=y> and <b>bold</b>';
  const h = stripLtrIsolates(render(hostile, { allowInlineHtml: true }).html);
  check(h.includes('<b>bold</b>'), `[${lang}] <b> is on the rule-6 allowlist and should render`);
  check(!/<script|<img|<span class="evil"/.test(h),
    `[${lang}] non-allowlisted tags must stay escaped, got: ${h}`);
  check(h.includes('&lt;script&gt;') && h.includes('&lt;img'),
    `[${lang}] non-allowlisted tags must still be visible as escaped text`);
  check(h.includes('&lt;user&gt;'),
    `[${lang}] <user> placeholder must survive as visible escaped text, got: ${h}`);

  /* ── 4. Sentinels never leak ──────────────────────────────────────────── */
  // A sentinel reaching the DOM would be an invisible control character in
  // the page — worse than the bug it replaced, because nobody would see it.
  const leak = render(sample, { allowInlineHtml: true }).html
    + render(hostile, { allowInlineHtml: true }).html;
  check(!SENT_RE.test(leak), `[${lang}] sentinel control characters leaked into the output`);

  /* ── 5. A user-authored sentinel cannot forge markup ──────────────────── */
  // If someone pastes U+0001/U+0002 into a guide, the restore pass must not
  // resolve it into a tag that was never in the source.
  const forged = stripLtrIsolates(render(SENT_A + '0' + SENT_B + ' plain text', { allowInlineHtml: true }).html);
  check(!/<span class="ltr-term">/.test(forged),
    `[${lang}] a hand-written sentinel must not resolve to markup, got: ${forged}`);
}

/* ── 6. The real guide files ────────────────────────────────────────────── */
// The end-to-end case: what the live site actually renders. Hebrew is the
// default language and is where the bug was worst, so it is the arm asserted.
const renderHe = renderFor('he');
const guidesDir = path.join(repoRoot, 'workflows');
const mdFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) mdFiles.push(p);
  }
})(guidesDir);

check(mdFiles.length > 0, 'no workflow guide .md files found under workflows/');

for (const f of mdFiles) {
  const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
  const md = fs.readFileSync(f, 'utf8');
  const out = stripLtrIsolates(renderHe(md, { allowInlineHtml: true }).html);
  const spansInSource = (md.match(/<span class="ltr-term">/g) || []).length;
  const spansRendered = (out.match(/<span class="ltr-term">/g) || []).length;
  check(spansRendered === spansInSource,
    `${rel}: ${spansInSource} ltr-term spans in source but ${spansRendered} rendered`);
  // The exact debris seen on the live site.
  check(!out.includes('ltr-term&quot;') && !out.includes('&lt;span class'),
    `${rel}: escaped-tag debris still present in rendered output`);
  check(!SENT_RE.test(out), `${rel}: sentinel control characters leaked into rendered output`);
  console.log(`${rel}: ${spansRendered}/${spansInSource} ltr-term spans rendered, ${out.length} chars`);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s) found.`);
  process.exit(1);
}
console.log('OK: guide markdown honours the rule-6 inline allowlist; the AI chat path stays fully escaped.');
