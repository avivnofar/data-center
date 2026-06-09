#!/usr/bin/env node
// Weekly data quality health check.
// Run with --summary flag to output GitHub Actions markdown summary format.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const isSummary = process.argv.includes('--summary');

const APPROVED_DOMAINS = [
  'man7.org', 'linux.die.net', 'learn.microsoft.com', 'docs.microsoft.com',
  'ss64.com', 'linux.org', 'kernel.org', 'iana.org', 'rfc-editor.org',
  'nmap.org', 'wireshark.org', 'ubuntu.com', 'redhat.com', 'debian.org',
  'cloudflare.com', 'cisco.com', 'tcpdump.org', 'iperf.fr',
];

function isApprovedDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return APPROVED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch (_) {
    return false;
  }
}

function loadJson(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    return null;
  }
}

const report = {
  modules: {},
  missingSourceUrl: [],
  unapprovedSourceUrl: [],
  totalEntries: 0,
};

const files = [
  { name: 'linux.json', type: 'command' },
  { name: 'cmd.json', type: 'command' },
  { name: 'network.json', type: 'command' },
  { name: 'troubleshoot.json', type: 'troubleshoot' },
];

for (const { name } of files) {
  const data = loadJson(name);
  if (!data) {
    report.modules[name] = { count: 0, error: 'Failed to parse' };
    continue;
  }
  report.modules[name] = { count: data.length };
  report.totalEntries += data.length;

  data.forEach(entry => {
    const id = `${name}::${entry.id || '(missing)'}`;
    if (!entry.source_url) {
      report.missingSourceUrl.push(id);
    } else if (!isApprovedDomain(entry.source_url)) {
      report.unapprovedSourceUrl.push({ id, url: entry.source_url });
    }
  });
}

if (isSummary) {
  // GitHub Actions step summary format (markdown)
  console.log('| Module | Entry Count |');
  console.log('|--------|------------|');
  for (const [name, info] of Object.entries(report.modules)) {
    const status = info.error ? `⚠️ ${info.error}` : info.count;
    console.log(`| ${name} | ${status} |`);
  }
  console.log('');
  console.log(`**Total entries:** ${report.totalEntries}`);
  console.log('');

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
    console.log(`⚠️ **${report.unapprovedSourceUrl.length} entries with unapproved \`source_url\`:**`);
    report.unapprovedSourceUrl.forEach(({ id, url }) =>
      console.log(`- \`${id}\`: ${url}`)
    );
  }
} else {
  // Plain text for console
  console.log('=== Data Center — Weekly Health Check ===\n');
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
  console.log('');

  if (report.unapprovedSourceUrl.length === 0) {
    console.log('✓  All source_url values point to approved domains');
  } else {
    console.log(`✗  ${report.unapprovedSourceUrl.length} entries with unapproved source_url:`);
    report.unapprovedSourceUrl.forEach(({ id, url }) =>
      console.log(`  - ${id}: ${url}`)
    );
  }

  const hasIssues = report.missingSourceUrl.length + report.unapprovedSourceUrl.length;
  if (hasIssues > 0) process.exit(1);
}
