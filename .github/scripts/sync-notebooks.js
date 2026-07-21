#!/usr/bin/env node
// Weekly Notebook-X mirror sync — pulls the public index and every listed
// notebook from avivnofar/Notebook-X (private repo) via the GitHub Contents
// API, using a read-only fine-grained PAT stored as the NOTEBOOKX_READ_TOKEN
// secret. Everything is fetched and validated in memory FIRST; files under
// data/notebooks/ are only written if every fetched file parses as valid
// JSON and the index has a sane shape — a broken upstream run must never
// clobber good local data. Committing (only if something actually changed)
// is left to the calling workflow.

const fs = require('fs');
const path = require('path');

const OWNER = 'avivnofar';
const REPO = 'Notebook-X';
const NOTEBOOKS_DIR = path.join(__dirname, '../../data/notebooks');
const TOKEN = process.env.NOTEBOOKX_READ_TOKEN;

if (!TOKEN) {
  console.error('✗  NOTEBOOKX_READ_TOKEN is not set — cannot authenticate to the private Notebook-X repo.');
  process.exit(1);
}

async function fetchRawFile(repoPath) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${repoPath}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'data-center-notebook-sync',
    },
  });
  if (!res.ok) {
    throw new Error(`GET ${repoPath} failed: HTTP ${res.status}`);
  }
  return res.text();
}

function validateIndex(index) {
  if (!index || typeof index !== 'object' || !Array.isArray(index.notebooks)) {
    throw new Error('_index-public.json: missing or non-array "notebooks" field');
  }
  index.notebooks.forEach((n, i) => {
    if (!n.id || typeof n.id !== 'string') throw new Error(`_index-public.json: notebooks[${i}] missing "id"`);
    if (!n.githubRawUrl || typeof n.githubRawUrl !== 'string') throw new Error(`_index-public.json: notebooks[${i}] ("${n.id}") missing "githubRawUrl"`);
    if (!Array.isArray(n.tags)) throw new Error(`_index-public.json: notebooks[${i}] ("${n.id}") missing "tags" array`);
  });
}

(async () => {
  console.log(`Fetching notebooks/_index-public.json from ${OWNER}/${REPO}...`);
  const indexRaw = await fetchRawFile('notebooks/_index-public.json');

  let index;
  try {
    index = JSON.parse(indexRaw);
  } catch (e) {
    console.error(`✗  _index-public.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }

  try {
    validateIndex(index);
  } catch (e) {
    console.error(`✗  _index-public.json failed structural validation: ${e.message}`);
    process.exit(1);
  }

  // Fetch every notebook listed in the index, fully, before writing anything.
  const fetched = [{ filename: '_index-public.json', content: indexRaw }];
  for (const n of index.notebooks) {
    const filename = `${n.id}.json`;
    console.log(`Fetching notebooks/${filename}...`);
    const raw = await fetchRawFile(`notebooks/${filename}`);
    try {
      JSON.parse(raw);
    } catch (e) {
      console.error(`✗  ${filename} is not valid JSON: ${e.message}`);
      process.exit(1);
    }
    fetched.push({ filename, content: raw });
  }

  console.log(`✓  All ${fetched.length} files fetched and parsed as valid JSON.`);

  // Everything validated — now write. Track whether anything actually changed
  // so the calling workflow can skip a no-op commit.
  fs.mkdirSync(NOTEBOOKS_DIR, { recursive: true });
  let changed = false;
  for (const { filename, content } of fetched) {
    const filepath = path.join(NOTEBOOKS_DIR, filename);
    const existing = fs.existsSync(filepath) ? fs.readFileSync(filepath, 'utf8') : null;
    if (existing !== content) {
      fs.writeFileSync(filepath, content);
      changed = true;
    }
  }

  console.log(changed ? '✓  data/notebooks/ updated.' : '✓  No changes — mirror already up to date.');
})().catch((e) => {
  console.error(`✗  Sync failed: ${e.message}`);
  process.exit(1);
});
