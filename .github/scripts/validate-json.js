#!/usr/bin/env node
// Validates data/*.json against the expected schemas.
// Exits 1 and prints all errors if any entry is malformed.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
let errors = [];

function fail(file, id, msg) {
  errors.push(`[${file}] entry "${id}": ${msg}`);
}

// ── Command entry schema (linux / cmd / network) ─────────────────────────────
const COMMAND_DIFF = ['beginner', 'intermediate', 'advanced'];
const CATEGORY_MAP = {
  'linux.json':   ['network', 'process', 'disk', 'permission', 'system', 'logs', 'user'],
  'cmd.json':     ['network', 'process', 'disk', 'system', 'user'],
  'network.json': ['diagnostic', 'ports', 'routing', 'dns', 'firewall'],
};

function validateCommandEntry(entry, file) {
  const id = entry.id || '(missing id)';

  if (!entry.id || typeof entry.id !== 'string')
    fail(file, id, '"id" must be a non-empty string');

  if (!entry.name || typeof entry.name !== 'string')
    fail(file, id, '"name" must be a non-empty string');

  const allowedCats = CATEGORY_MAP[file];
  if (!entry.cat || !allowedCats.includes(entry.cat))
    fail(file, id, `"cat" must be one of: ${allowedCats.join(', ')} — got "${entry.cat}"`);

  if (!COMMAND_DIFF.includes(entry.diff))
    fail(file, id, `"diff" must be one of: ${COMMAND_DIFF.join(', ')} — got "${entry.diff}"`);

  if (typeof entry.sec !== 'boolean')
    fail(file, id, '"sec" must be a boolean');

  if (!entry.desc || typeof entry.desc !== 'string')
    fail(file, id, '"desc" must be a non-empty string');

  if (!Array.isArray(entry.usage) || entry.usage.length < 1)
    fail(file, id, '"usage" must be a non-empty array');
  else {
    entry.usage.forEach((u, i) => {
      if (!u.cmd || typeof u.cmd !== 'string')
        fail(file, id, `usage[${i}].cmd must be a non-empty string`);
      if (typeof u.cmt !== 'string')
        fail(file, id, `usage[${i}].cmt must be a string`);
    });
  }

  if (!Array.isArray(entry.scenarios) || entry.scenarios.length < 1)
    fail(file, id, '"scenarios" must be a non-empty array of strings');
  else {
    entry.scenarios.forEach((s, i) => {
      if (typeof s !== 'string')
        fail(file, id, `scenarios[${i}] must be a string`);
    });
  }

  if (!Array.isArray(entry.mistakes) || entry.mistakes.length < 1)
    fail(file, id, '"mistakes" must be a non-empty array');
  else {
    entry.mistakes.forEach((m, i) => {
      if (!m.x || typeof m.x !== 'string')
        fail(file, id, `mistakes[${i}].x must be a non-empty string`);
      if (!m.fix || typeof m.fix !== 'string')
        fail(file, id, `mistakes[${i}].fix must be a non-empty string`);
    });
  }

  if (!entry.tags || typeof entry.tags !== 'string')
    fail(file, id, '"tags" must be a non-empty string');

  // secnote is optional but must be a string if present
  if (entry.secnote !== undefined && typeof entry.secnote !== 'string')
    fail(file, id, '"secnote" must be a string when present');
}

// ── Troubleshoot entry schema ────────────────────────────────────────────────
const TS_PLAT = ['linux', 'windows', 'network'];
const TS_SEV  = ['critical', 'high', 'medium'];

function validateTsEntry(entry, file) {
  const id = entry.id || '(missing id)';

  if (!entry.id || typeof entry.id !== 'string')
    fail(file, id, '"id" must be a non-empty string');

  if (!entry.title || typeof entry.title !== 'string')
    fail(file, id, '"title" must be a non-empty string');

  if (!TS_PLAT.includes(entry.plat))
    fail(file, id, `"plat" must be one of: ${TS_PLAT.join(', ')} — got "${entry.plat}"`);

  if (!TS_SEV.includes(entry.severity))
    fail(file, id, `"severity" must be one of: ${TS_SEV.join(', ')} — got "${entry.severity}"`);

  if (!entry.desc || typeof entry.desc !== 'string')
    fail(file, id, '"desc" must be a non-empty string');

  if (!Array.isArray(entry.steps) || entry.steps.length < 1)
    fail(file, id, '"steps" must be a non-empty array');
  else {
    entry.steps.forEach((s, i) => {
      if (typeof s.n !== 'number')
        fail(file, id, `steps[${i}].n must be a number`);
      if (!s.text || typeof s.text !== 'string')
        fail(file, id, `steps[${i}].text must be a non-empty string`);
      if (!s.cmd || typeof s.cmd !== 'string')
        fail(file, id, `steps[${i}].cmd must be a non-empty string`);
      if (typeof s.note !== 'string')
        fail(file, id, `steps[${i}].note must be a string`);
    });
  }
}

// ── Check for duplicate IDs across all files ─────────────────────────────────
const seenIds = new Set();
function checkDuplicateId(entry, file) {
  if (!entry.id) return;
  if (seenIds.has(entry.id))
    fail(file, entry.id, `duplicate id "${entry.id}" already exists in another file`);
  else
    seenIds.add(entry.id);
}

// ── Run validation ────────────────────────────────────────────────────────────
const commandFiles = ['linux.json', 'cmd.json', 'network.json'];
const tsFiles      = ['troubleshoot.json'];

for (const filename of commandFiles) {
  const filepath = path.join(DATA_DIR, filename);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    errors.push(`[${filename}] JSON parse error: ${e.message}`);
    continue;
  }
  if (!Array.isArray(data)) {
    errors.push(`[${filename}] root must be a JSON array`);
    continue;
  }
  data.forEach(entry => {
    validateCommandEntry(entry, filename);
    checkDuplicateId(entry, filename);
  });
  console.log(`✓  ${filename}: ${data.length} entries`);
}

for (const filename of tsFiles) {
  const filepath = path.join(DATA_DIR, filename);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    errors.push(`[${filename}] JSON parse error: ${e.message}`);
    continue;
  }
  if (!Array.isArray(data)) {
    errors.push(`[${filename}] root must be a JSON array`);
    continue;
  }
  data.forEach(entry => {
    validateTsEntry(entry, filename);
    checkDuplicateId(entry, filename);
  });
  console.log(`✓  ${filename}: ${data.length} entries`);
}

if (errors.length > 0) {
  console.error(`\n✗  Validation failed with ${errors.length} error(s):\n`);
  errors.forEach(e => console.error('  ' + e));
  process.exit(1);
} else {
  console.log('\n✓  All JSON files are valid.');
}
