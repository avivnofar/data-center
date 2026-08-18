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
  extractFn('notebookQueryTokens'),
  extractFn('buildDbContext'),
].join('\n');

const DB = {
  linux: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/linux.json'), 'utf8')),
  cmd: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/cmd.json'), 'utf8')),
  network: JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/network.json'), 'utf8')),
};

const buildDbContext = new Function('DB', `${fnSrc}\nreturn buildDbContext;`)(DB);

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

if (failures > 0) {
  console.error(`\n${failures} failure(s) found.`);
  process.exit(1);
}
console.log('OK: buildDbContext() stopword/length filter holds across 3 test cases.');
