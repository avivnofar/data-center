#!/usr/bin/env node
// Daily link checker — verifies all source_url values in data/*.json are reachable.
// Run with --summary flag to output GitHub Actions markdown summary format.
// Bot-blocked statuses (401/403/429) are reported as warnings, not failures,
// since several approved doc sites block default CI user agents.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const isSummary = process.argv.includes('--summary');
const TIMEOUT_MS = 10000;
const FILES = ['linux.json', 'cmd.json', 'network.json', '1com.json', 'mirtapbx.json'];
const UA = 'Mozilla/5.0 (compatible; DataCenterLinkCheck/1.0; +https://avivnofar.github.io/data-center)';

function loadJson(filename) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
  } catch (e) {
    return [];
  }
}

async function checkUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': UA } });
    if (res.status === 405) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': UA } });
    }
    return { url, status: res.status };
  } catch (e) {
    return { url, status: 0, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

function classify(status) {
  if (status >= 200 && status < 400) return 'ok';
  if ([401, 403, 429].includes(status)) return 'warn';
  return 'broken'; // 404, 410, 5xx, 0 (network error/timeout)
}

(async () => {
  const urlMap = new Map(); // url -> [ids]
  for (const file of FILES) {
    const data = loadJson(file);
    data.forEach(entry => {
      if (entry.source_url) {
        const id = `${file}::${entry.id}`;
        if (!urlMap.has(entry.source_url)) urlMap.set(entry.source_url, []);
        urlMap.get(entry.source_url).push(id);
      }
    });
  }

  const results = [];
  for (const [url, ids] of urlMap) {
    const r = await checkUrl(url);
    results.push({ ...r, ids, kind: classify(r.status) });
  }

  const broken = results.filter(r => r.kind === 'broken');
  const warn = results.filter(r => r.kind === 'warn');

  if (isSummary) {
    console.log('## Data Center — Daily Link Check');
    console.log('');
    console.log(`Checked **${results.length}** unique source URLs.`);
    console.log('');
    if (broken.length === 0) {
      console.log('✅ No broken links found');
    } else {
      console.log(`❌ **${broken.length} broken/unreachable URL(s):**`);
      broken.forEach(({ url, status, error, ids }) =>
        console.log(`- \`${url}\` (status: ${status}${error ? `, error: ${error}` : ''}) — used by: ${ids.join(', ')}`)
      );
    }
    console.log('');
    if (warn.length > 0) {
      console.log(`⚠️ **${warn.length} URL(s) returned bot-blocked status (not counted as broken):**`);
      warn.forEach(({ url, status, ids }) =>
        console.log(`- \`${url}\` (status: ${status}) — used by: ${ids.join(', ')}`)
      );
    }
  } else {
    console.log(`Checked ${results.length} unique source URLs.`);
    if (warn.length > 0) {
      console.log(`${warn.length} URL(s) returned bot-blocked status (401/403/429), not counted as broken:`);
      warn.forEach(({ url, status, ids }) => console.log(`  - ${url} (status: ${status}) — used by: ${ids.join(', ')}`));
    }
    if (broken.length === 0) {
      console.log('All source URLs reachable. ✓');
    } else {
      console.log(`${broken.length} broken/unreachable URL(s):`);
      broken.forEach(({ url, status, error, ids }) =>
        console.log(`  - ${url} (status: ${status}${error ? `, error: ${error}` : ''}) — used by: ${ids.join(', ')}`)
      );
      process.exit(1);
    }
  }
})();
