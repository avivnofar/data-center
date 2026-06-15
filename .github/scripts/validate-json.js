#!/usr/bin/env node
// Validates data/*.json against the bilingual schema.
// Enforces source_url presence and approved-domain allowlist.
// Exits 1 and prints all errors if any entry is malformed.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
let errors = [];
let passed = 0;

function fail(file, id, msg) {
  errors.push(`[${file}] entry "${id}": ${msg}`);
}

// ── Approved source domains ───────────────────────────────────────────────────
const APPROVED_DOMAINS = [
  'man7.org',
  'linux.die.net',
  'learn.microsoft.com',
  'docs.microsoft.com',
  'ss64.com',
  'linux.org',
  'kernel.org',
  'iana.org',
  'rfc-editor.org',
  'nmap.org',
  'wireshark.org',
  'ubuntu.com',
  'redhat.com',
  'debian.org',
  'cloudflare.com',
  'cisco.com',
  'tcpdump.org',
  'iperf.fr',
  'software.es.net',
  'asterisk.org',
  '1com.co.il',
  'mirtapbx.com',
  'queuemetrics.com',
];

const BLOCKED_DOMAINS = [
  'stackoverflow.com',
  'reddit.com',
  'medium.com',
  'youtube.com',
  'github.com',
  'geeksforgeeks.org',
  'w3schools.com',
  'blogspot.com',
];

function validateSourceUrl(url, file, id) {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    fail(file, id, '"source_url" is REQUIRED — must be an official documentation URL');
    return;
  }

  let hostname;
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '');
  } catch (e) {
    fail(file, id, `"source_url" is not a valid URL: ${url}`);
    return;
  }

  for (const blocked of BLOCKED_DOMAINS) {
    if (hostname === blocked || hostname.endsWith('.' + blocked)) {
      fail(file, id, `"source_url" points to a blocked domain (${hostname}): ${url}`);
      return;
    }
  }

  const isApproved = APPROVED_DOMAINS.some(
    (d) => hostname === d || hostname.endsWith('.' + d)
  );

  if (!isApproved) {
    fail(
      file,
      id,
      `"source_url" domain "${hostname}" is not on the approved list. ` +
        `Approved: ${APPROVED_DOMAINS.join(', ')}`
    );
  }
}

// ── Hebrew character detection ────────────────────────────────────────────────
function hasHebrew(str) {
  return /[א-׿יִ-ﭏ]/.test(str);
}

function requireBilingual(file, id, obj, prefix) {
  const heKey = `${prefix}_he`;
  const enKey = `${prefix}_en`;
  if (!obj[heKey] || typeof obj[heKey] !== 'string' || obj[heKey].trim() === '')
    fail(file, id, `"${heKey}" must be a non-empty Hebrew string`);
  if (!obj[enKey] || typeof obj[enKey] !== 'string' || obj[enKey].trim() === '')
    fail(file, id, `"${enKey}" must be a non-empty English string`);
  if (obj[heKey] && obj[enKey] && obj[heKey].trim() === obj[enKey].trim())
    fail(file, id, `"${heKey}" and "${enKey}" must not be identical — they appear to be copy-pasted`);
}

// ── Command entry schema (linux / cmd / network) ─────────────────────────────
const COMMAND_DIFF = ['beginner', 'intermediate', 'advanced'];
const CATEGORY_MAP = {
  'linux.json':    ['network', 'process', 'disk', 'permission', 'system', 'logs', 'user'],
  'cmd.json':      ['network', 'process', 'disk', 'system', 'user'],
  'network.json':  ['diagnostic', 'ports', 'routing', 'dns', 'firewall', 'voip'],
  '1com.json':     ['hardware', 'config', 'ivr', 'queue', 'omnichannel', 'monitoring', 'integration'],
  'mirtapbx.json': ['architecture', 'cluster', 'sip', 'recording', 'reporting', 'integration', 'webrtc'],
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

  // Bilingual desc
  requireBilingual(file, id, entry, 'desc');

  // source_url and source_name — REQUIRED
  validateSourceUrl(entry.source_url, file, id);
  if (!entry.source_name || typeof entry.source_name !== 'string')
    fail(file, id, '"source_name" is REQUIRED — e.g. "Linux man page", "Microsoft Docs"');

  // usage — bilingual cmt
  if (!Array.isArray(entry.usage) || entry.usage.length < 1)
    fail(file, id, '"usage" must be a non-empty array');
  else {
    entry.usage.forEach((u, i) => {
      if (!u.cmd || typeof u.cmd !== 'string')
        fail(file, id, `usage[${i}].cmd must be a non-empty string`);
      else if (hasHebrew(u.cmd))
        fail(file, id, `usage[${i}].cmd must not contain Hebrew characters — commands are always LTR`);
      if (typeof u.cmt_he !== 'string' || u.cmt_he.trim() === '')
        fail(file, id, `usage[${i}].cmt_he must be a non-empty string`);
      if (typeof u.cmt_en !== 'string' || u.cmt_en.trim() === '')
        fail(file, id, `usage[${i}].cmt_en must be a non-empty string`);
    });
  }

  // quick_flags — bilingual desc when present
  if (entry.quick_flags !== undefined) {
    if (!Array.isArray(entry.quick_flags))
      fail(file, id, '"quick_flags" must be an array when present');
    else {
      entry.quick_flags.forEach((f, i) => {
        if (!f.flag || typeof f.flag !== 'string')
          fail(file, id, `quick_flags[${i}].flag must be a non-empty string`);
        else if (hasHebrew(f.flag))
          fail(file, id, `quick_flags[${i}].flag must not contain Hebrew characters`);
        if (typeof f.desc_he !== 'string' || f.desc_he.trim() === '')
          fail(file, id, `quick_flags[${i}].desc_he must be a non-empty string`);
        if (typeof f.desc_en !== 'string' || f.desc_en.trim() === '')
          fail(file, id, `quick_flags[${i}].desc_en must be a non-empty string`);
      });
    }
  }

  // scenarios — bilingual arrays
  if (!Array.isArray(entry.scenarios_he) || entry.scenarios_he.length < 1)
    fail(file, id, '"scenarios_he" must be a non-empty array of Hebrew strings');
  else {
    entry.scenarios_he.forEach((s, i) => {
      if (typeof s !== 'string' || s.trim() === '')
        fail(file, id, `scenarios_he[${i}] must be a non-empty string`);
    });
  }

  if (!Array.isArray(entry.scenarios_en) || entry.scenarios_en.length < 1)
    fail(file, id, '"scenarios_en" must be a non-empty array of English strings');
  else {
    entry.scenarios_en.forEach((s, i) => {
      if (typeof s !== 'string' || s.trim() === '')
        fail(file, id, `scenarios_en[${i}] must be a non-empty string`);
    });
  }

  // mistakes — bilingual fields
  if (!Array.isArray(entry.mistakes) || entry.mistakes.length < 1)
    fail(file, id, '"mistakes" must be a non-empty array');
  else {
    entry.mistakes.forEach((m, i) => {
      if (!m.x_he || typeof m.x_he !== 'string')
        fail(file, id, `mistakes[${i}].x_he must be a non-empty string`);
      if (!m.x_en || typeof m.x_en !== 'string')
        fail(file, id, `mistakes[${i}].x_en must be a non-empty string`);
      if (!m.fix_he || typeof m.fix_he !== 'string')
        fail(file, id, `mistakes[${i}].fix_he must be a non-empty string`);
      if (!m.fix_en || typeof m.fix_en !== 'string')
        fail(file, id, `mistakes[${i}].fix_en must be a non-empty string`);
    });
  }

  if (!entry.tags || typeof entry.tags !== 'string')
    fail(file, id, '"tags" must be a non-empty string');

  // secnote_he / secnote_en — optional but paired
  if (entry.sec === true) {
    if (entry.secnote_he !== undefined && typeof entry.secnote_he !== 'string')
      fail(file, id, '"secnote_he" must be a string when present');
    if (entry.secnote_en !== undefined && typeof entry.secnote_en !== 'string')
      fail(file, id, '"secnote_en" must be a string when present');
  }
}

// ── Troubleshoot entry schema ────────────────────────────────────────────────
const TS_PLAT = ['linux', 'windows', 'network', 'cross-platform'];
const TS_SEV  = ['critical', 'high', 'medium', 'low'];

function validateTsEntry(entry, file) {
  const id = entry.id || '(missing id)';

  if (!entry.id || typeof entry.id !== 'string')
    fail(file, id, '"id" must be a non-empty string');
  if (!/^ts-/.test(entry.id))
    fail(file, id, '"id" must start with "ts-" prefix');

  requireBilingual(file, id, entry, 'title');
  requireBilingual(file, id, entry, 'desc');

  if (!TS_PLAT.includes(entry.plat))
    fail(file, id, `"plat" must be one of: ${TS_PLAT.join(', ')} — got "${entry.plat}"`);

  if (!TS_SEV.includes(entry.severity))
    fail(file, id, `"severity" must be one of: ${TS_SEV.join(', ')} — got "${entry.severity}"`);

  if (!Array.isArray(entry.steps) || entry.steps.length < 4)
    fail(file, id, '"steps" must be an array with at least 4 steps');
  else {
    entry.steps.forEach((s, i) => {
      if (typeof s.n !== 'number')
        fail(file, id, `steps[${i}].n must be a number`);
      if (!s.text_he || typeof s.text_he !== 'string')
        fail(file, id, `steps[${i}].text_he must be a non-empty string`);
      if (!s.text_en || typeof s.text_en !== 'string')
        fail(file, id, `steps[${i}].text_en must be a non-empty string`);
      if (!s.cmd || typeof s.cmd !== 'string')
        fail(file, id, `steps[${i}].cmd must be a non-empty string`);
      else if (hasHebrew(s.cmd))
        fail(file, id, `steps[${i}].cmd must not contain Hebrew characters`);
      if (typeof s.note_he !== 'string')
        fail(file, id, `steps[${i}].note_he must be a string`);
      if (typeof s.note_en !== 'string')
        fail(file, id, `steps[${i}].note_en must be a string`);
    });
  }
}

// ── modules.json validation ──────────────────────────────────────────────────
function validateModulesJson() {
  const filepath = path.join(DATA_DIR, 'modules.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    errors.push(`[modules.json] JSON parse error: ${e.message}`);
    return;
  }
  if (!Array.isArray(data)) {
    errors.push('[modules.json] root must be a JSON array');
    return;
  }
  const STATUSES = ['active', 'coming-soon'];
  data.forEach((m, i) => {
    const id = m.id || `(index ${i})`;
    if (!m.id) errors.push(`[modules.json] entry ${i}: "id" is required`);
    if (!m.label_he && !m.label)
      errors.push(`[modules.json] entry "${id}": "label_he" or "label" is required`);
    if (!m.data_file) errors.push(`[modules.json] entry "${id}": "data_file" is required`);
    if (!STATUSES.includes(m.status))
      errors.push(`[modules.json] entry "${id}": "status" must be one of: ${STATUSES.join(', ')}`);
  });
  console.log(`✓  modules.json: ${data.length} modules`);
  passed++;
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
validateModulesJson();

const commandFiles = ['linux.json', 'cmd.json', 'network.json', '1com.json', 'mirtapbx.json'];
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
  passed++;
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
  passed++;
}

if (errors.length > 0) {
  console.error(`\n✗  Validation failed with ${errors.length} error(s):\n`);
  errors.forEach(e => console.error('  ' + e));
  process.exit(1);
} else {
  console.log(`\n✓  All ${passed} JSON files are valid. Bilingual schema and source_url domains checked.`);
}
