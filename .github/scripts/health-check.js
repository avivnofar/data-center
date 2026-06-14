#!/usr/bin/env node
// Weekly data quality health check — bilingual edition.
// Run with --summary flag to output GitHub Actions markdown summary format.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const isSummary = process.argv.includes('--summary');

const APPROVED_DOMAINS = [
  'man7.org', 'linux.die.net', 'learn.microsoft.com', 'docs.microsoft.com',
  'ss64.com', 'linux.org', 'kernel.org', 'iana.org', 'rfc-editor.org',
  'nmap.org', 'wireshark.org', 'ubuntu.com', 'redhat.com', 'debian.org',
  'cloudflare.com', 'cisco.com', 'tcpdump.org', 'iperf.fr', 'software.es.net',
  'asterisk.org',
];

function isApprovedDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return APPROVED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch (_) {
    return false;
  }
}

function hasHebrew(str) {
  return /[א-׿]/.test(str);
}

function loadJson(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    return null;
  }
}

// ── Hebrew quality checks ─────────────────────────────────────────────────────

// Check if a Hebrew text field looks like it was filled with English instead
function isEnglishInHebrewField(str) {
  if (!str) return false;
  const hebrewChars = (str.match(/[א-ת]/g) || []).length;
  const totalLetters = (str.match(/[a-zA-Zא-ת]/g) || []).length;
  if (totalLetters === 0) return false;
  // If less than 10% Hebrew characters, likely English placed in Hebrew field
  // (IT Hebrew text legitimately has many English technical terms)
  return (hebrewChars / totalLetters) < 0.10;
}

// Check for long English words in Hebrew field (4+ consecutive English words without ltr-term wrap)
function hasLongEnglishSequenceInHebrew(str) {
  if (!str) return false;
  // Remove known ltr-term wrapped content
  const cleaned = str.replace(/<span[^>]*>.*?<\/span>/g, '');
  // Match 4+ consecutive English words (simple heuristic)
  return /\b[a-zA-Z]+(?:\s+[a-zA-Z]+){4,}\b/.test(cleaned);
}

const report = {
  modules: {},
  missingSourceUrl: [],
  unapprovedSourceUrl: [],
  hebrewQualityIssues: [],
  hebrewInCmdFields: [],
  shortDescHe: [],
  identicalTranslations: [],
  totalEntries: 0,
  criticalCount: 0,
};

const files = [
  { name: 'linux.json', type: 'command' },
  { name: 'cmd.json', type: 'command' },
  { name: 'network.json', type: 'command' },
  { name: 'troubleshoot.json', type: 'troubleshoot' },
];

for (const { name, type } of files) {
  const data = loadJson(name);
  if (!data) {
    report.modules[name] = { count: 0, error: 'Failed to parse' };
    report.criticalCount++;
    continue;
  }
  report.modules[name] = { count: data.length };
  report.totalEntries += data.length;

  data.forEach(entry => {
    const id = `${name}::${entry.id || '(missing)'}`;

    // source_url checks (troubleshoot entries don't require source_url)
    if (type !== 'troubleshoot') {
      if (!entry.source_url) {
        report.missingSourceUrl.push(id);
        report.criticalCount++;
      } else if (!isApprovedDomain(entry.source_url)) {
        report.unapprovedSourceUrl.push({ id, url: entry.source_url });
        report.criticalCount++;
      }
    }

    // Hebrew quality: desc_he length
    const descHe = type === 'troubleshoot' ? entry.desc_he : entry.desc_he;
    if (descHe && typeof descHe === 'string' && descHe.trim().length < 15) {
      report.shortDescHe.push({ id, value: descHe });
    }

    // Hebrew quality: English in Hebrew field
    if (descHe && isEnglishInHebrewField(descHe)) {
      report.hebrewQualityIssues.push({ id, field: 'desc_he', issue: 'mostly English content in Hebrew field' });
    }

    // Hebrew quality: long English sequences without ltr-term wrapping
    if (descHe && hasLongEnglishSequenceInHebrew(descHe)) {
      report.hebrewQualityIssues.push({ id, field: 'desc_he', issue: '5+ consecutive English words — consider wrapping technical terms in ltr-term' });
    }

    // Hebrew in cmd fields — check usage[].cmd
    if (Array.isArray(entry.usage)) {
      entry.usage.forEach((u, i) => {
        if (u.cmd && hasHebrew(u.cmd)) {
          report.hebrewInCmdFields.push({ id, field: `usage[${i}].cmd`, value: u.cmd });
          report.criticalCount++;
        }
      });
    }

    // Hebrew in cmd fields — check steps[].cmd
    if (Array.isArray(entry.steps)) {
      entry.steps.forEach((s, i) => {
        if (s.cmd && hasHebrew(s.cmd)) {
          report.hebrewInCmdFields.push({ id, field: `steps[${i}].cmd`, value: s.cmd });
          report.criticalCount++;
        }
      });
    }

    // Identical translations
    if (entry.desc_he && entry.desc_en && entry.desc_he.trim() === entry.desc_en.trim()) {
      report.identicalTranslations.push({ id, field: 'desc' });
      report.criticalCount++;
    }
  });
}

if (isSummary) {
  // GitHub Actions step summary format (markdown)
  console.log('## Data Center — Weekly Health Report');
  console.log('');
  console.log('| Module | Entry Count |');
  console.log('|--------|------------|');
  for (const [name, info] of Object.entries(report.modules)) {
    const status = info.error ? `⚠️ ${info.error}` : info.count;
    console.log(`| ${name} | ${status} |`);
  }
  console.log('');
  console.log(`**Total entries:** ${report.totalEntries}`);
  console.log('');

  // source_url checks
  if (report.missingSourceUrl.length === 0) {
    console.log('✅ All entries have `source_url`');
  } else {
    console.log(`❌ **${report.missingSourceUrl.length} entries missing \`source_url\`:**`);
    report.missingSourceUrl.forEach(id => console.log(`- \`${id}\``));
  }
  console.log('');

  if (report.unapprovedSourceUrl.length === 0) {
    console.log('✅ All `source_url` values point to approved domains');
  } else {
    console.log(`❌ **${report.unapprovedSourceUrl.length} entries with unapproved \`source_url\`:**`);
    report.unapprovedSourceUrl.forEach(({ id, url }) =>
      console.log(`- \`${id}\`: ${url}`)
    );
  }
  console.log('');

  // Hebrew quality checks
  if (report.hebrewInCmdFields.length === 0) {
    console.log('✅ No Hebrew characters found in cmd fields');
  } else {
    console.log(`❌ **${report.hebrewInCmdFields.length} cmd fields contain Hebrew characters:**`);
    report.hebrewInCmdFields.forEach(({ id, field }) =>
      console.log(`- \`${id}\` → \`${field}\``)
    );
  }
  console.log('');

  if (report.identicalTranslations.length === 0) {
    console.log('✅ No identical desc_he / desc_en pairs found');
  } else {
    console.log(`⚠️ **${report.identicalTranslations.length} entries with identical He/En descriptions:**`);
    report.identicalTranslations.forEach(({ id, field }) =>
      console.log(`- \`${id}\` → \`${field}\``)
    );
  }
  console.log('');

  if (report.shortDescHe.length === 0) {
    console.log('✅ All `desc_he` fields have sufficient length');
  } else {
    console.log(`⚠️ **${report.shortDescHe.length} entries with very short \`desc_he\` (< 15 chars):**`);
    report.shortDescHe.forEach(({ id, value }) =>
      console.log(`- \`${id}\`: "${value}"`)
    );
  }
  console.log('');

  if (report.hebrewQualityIssues.length === 0) {
    console.log('✅ Hebrew quality checks passed');
  } else {
    console.log(`⚠️ **${report.hebrewQualityIssues.length} Hebrew quality warnings:**`);
    report.hebrewQualityIssues.forEach(({ id, field, issue }) =>
      console.log(`- \`${id}\` → \`${field}\`: ${issue}`)
    );
  }
  console.log('');

  if (report.criticalCount > 0) {
    console.log(`> ⚠️ **${report.criticalCount} CRITICAL issue(s) found — see details above**`);
  } else {
    console.log('> ✅ **No critical issues found**');
  }
} else {
  // Plain text for console / local use
  console.log('=== Data Center — Weekly Health Check (Bilingual Edition) ===\n');
  console.log('Entry counts per module:');
  for (const [name, info] of Object.entries(report.modules)) {
    const status = info.error ? `ERROR: ${info.error}` : `${info.count} entries`;
    console.log(`  ${name}: ${status}`);
  }
  console.log(`\nTotal: ${report.totalEntries} entries\n`);

  if (report.missingSourceUrl.length === 0) {
    console.log('✓  All entries have source_url');
  } else {
    console.log(`✗  ${report.missingSourceUrl.length} entries missing source_url:`);
    report.missingSourceUrl.forEach(id => console.log(`  - ${id}`));
  }

  if (report.unapprovedSourceUrl.length === 0) {
    console.log('✓  All source_url values point to approved domains');
  } else {
    console.log(`✗  ${report.unapprovedSourceUrl.length} entries with unapproved source_url:`);
    report.unapprovedSourceUrl.forEach(({ id, url }) =>
      console.log(`  - ${id}: ${url}`)
    );
  }

  if (report.hebrewInCmdFields.length === 0) {
    console.log('✓  No Hebrew characters in cmd fields');
  } else {
    console.log(`✗  ${report.hebrewInCmdFields.length} cmd fields contain Hebrew characters:`);
    report.hebrewInCmdFields.forEach(({ id, field }) =>
      console.log(`  - ${id} → ${field}`)
    );
  }

  if (report.identicalTranslations.length === 0) {
    console.log('✓  No identical desc_he / desc_en pairs');
  } else {
    console.log(`✗  ${report.identicalTranslations.length} entries with identical translations:`);
    report.identicalTranslations.forEach(({ id, field }) =>
      console.log(`  - ${id} → ${field}`)
    );
  }

  if (report.shortDescHe.length === 0) {
    console.log('✓  All desc_he fields have sufficient length');
  } else {
    console.log(`⚠  ${report.shortDescHe.length} entries with very short desc_he (< 15 chars):`);
    report.shortDescHe.forEach(({ id, value }) =>
      console.log(`  - ${id}: "${value}"`)
    );
  }

  if (report.hebrewQualityIssues.length === 0) {
    console.log('✓  Hebrew quality checks passed');
  } else {
    console.log(`⚠  ${report.hebrewQualityIssues.length} Hebrew quality warnings:`);
    report.hebrewQualityIssues.forEach(({ id, field, issue }) =>
      console.log(`  - ${id} → ${field}: ${issue}`)
    );
  }

  console.log('');
  if (report.criticalCount > 0) {
    console.log(`CRITICAL: ${report.criticalCount} critical issue(s) found.`);
    process.exit(1);
  } else {
    console.log('All critical checks passed. ✓');
  }
}
