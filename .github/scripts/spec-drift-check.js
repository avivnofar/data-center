#!/usr/bin/env node
/**
 * spec-drift-check.js — mechanical drift detection for CURRENT-SPEC.md.
 *
 * WHY THIS EXISTS
 * ---------------
 * "No doc drift" is a hard rule for this project (CLAUDE.md), but the only
 * enforcement was the Auditor's daily spot-check, which samples 2-3 claims out
 * of ~27. A wrong claim survives indefinitely if it simply isn't sampled — and
 * that is exactly what happened: CURRENT-SPEC.md row 16 asserted that command
 * cards had no copy button for six days after copyUsageCmd() shipped, while two
 * separate documentation-update commits passed over it.
 *
 * A sampling check cannot fix that. This script checks EVERY registered claim,
 * every run, deterministically.
 *
 * WHAT IT DOES AND DOES NOT DO
 * ----------------------------
 * It only verifies claims that can be settled by looking at the repo: "this
 * identifier exists in this file", "this file exists", "this module is not
 * marked coming-soon". It cannot verify claims about runtime behaviour, design
 * intent, or whether a feature actually works well — those still need a human
 * or the Auditor's judgment. That is a deliberate boundary, not a gap: a check
 * that silently guesses is worse than no check.
 *
 * Exit codes: 0 = no drift, 1 = drift found, 2 = the check itself is broken
 * (e.g. a claim points at a file that no longer exists) — which is also worth
 * failing on, since a check that can't run is not a passing check.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => {
  const raw = fs.readFileSync(path.join(ROOT, p), 'utf8');
  // Only ever non-null while --self-test is mutating a copy; see selfTest().
  const patch = global.__patched;
  return patch && patch.file === p ? patch.mutate(raw) : raw;
};
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/**
 * Identifier lookup with a real word boundary.
 *
 * Deliberately NOT String.includes(): a substring match reports success for a
 * renamed symbol (searching "copyUsageCmd" matches "copyUsageCmdRENAMED"), so
 * the check would go green precisely when the code drifted. A self-test caught
 * this on the first negative run — see the --self-test flag at the bottom.
 */
const hasFn = (src, name) => new RegExp(`function\\s+${name}\\s*\\(`).test(src);
const hasIdent = (src, name) => new RegExp(`\\b${name}\\b`).test(src);

/* ────────────────────────────────────────────────────────────────────────────
 * THE CLAIM REGISTRY
 *
 * Each entry ties one statement in CURRENT-SPEC.md to a mechanical test.
 *   id      — stable handle, referenced in the spec table where practical
 *   claim   — the assertion, in plain words, as the spec makes it
 *   check   — returns true when the claim is STILL TRUE of the code
 *
 * When you change the code such that a claim flips, update the spec AND this
 * registry in the same commit. That is the whole point.
 * ──────────────────────────────────────────────────────────────────────────── */

const claims = [
  {
    id: 'copy-usage-rows',
    claim: 'Command-card usage rows have a copy-to-clipboard button (TODO-003)',
    check: () => {
      const s = read('index.html');
      return hasFn(s, 'copyUsageCmd') && s.includes('usage-copy-btn');
    },
  },
  {
    id: 'copy-ai-code',
    claim: 'AI chat code blocks have a copy button',
    check: () => hasFn(read('index.html'), 'copyAiCode'),
  },
  {
    id: 'suggestion-parsing',
    claim: 'CAPABILITY_SUGGESTION / LEARNED_SOURCE blocks are parsed client-side (TODO-001)',
    check: () => {
      const s = read('index.html');
      return hasFn(s, 'parseSuggestionBlocks') && hasFn(s, 'renderSuggestionCards');
    },
  },
  {
    id: 'no-issue-filing',
    claim: 'Nothing in the app files a GitHub Issue or writes to flagged/pending-review.md',
    // Inverted claim: this one asserts an ABSENCE, so drift means something
    // appeared. Checked by looking for the API surface such a feature would need.
    check: () => {
      const s = read('index.html');
      return !/api\.github\.com|createIssue|\/issues\b/.test(s);
    },
  },
  {
    id: 'bookmarks-browse-ui',
    claim: 'Saved-bookmarks browsing/management UI exists (TODO-004)',
    check: () => {
      const s = read('index.html');
      return hasFn(s, 'renderBookmarksList') && hasFn(s, 'openBookmarksPanel');
    },
  },
  {
    id: 'expand-collapse',
    claim: 'Expandable cards work with aria-expanded and keyboard support',
    check: () => {
      const s = read('index.html');
      return hasFn(s, 'toggleCard')
        && hasIdent(s, 'handleExpandKeydown')
        && s.includes('aria-expanded');
    },
  },
  {
    id: 'tab-keyboard-nav',
    claim: 'Tab navigation supports arrow keys, Home and End',
    check: () => {
      const s = read('index.html');
      return hasFn(s, 'handleTabNavKeydown')
        && s.includes("case 'Home'")
        && s.includes("case 'End'");
    },
  },
  {
    id: 'zero-dependency-core',
    claim: 'index.html pulls in no third-party or CDN JavaScript (CLAUDE.md rule 11: no build step)',
    // NOTE: "zero-dependency" here means no third-party/npm/CDN code — NOT "no
    // script tags at all". index.html does load one first-party local script,
    // tools/commandflow/commandflow-core.js, which CURRENT-SPEC.md row 26
    // documents deliberately. An earlier version of this check conflated the
    // two and produced a false positive; the rule being enforced is the actual
    // one, not the stricter-sounding one.
    check: () => {
      const s = read('index.html');
      const srcs = [...s.matchAll(/<script[^>]+\bsrc\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
      const remote = srcs.filter((u) => /^(https?:)?\/\//.test(u));
      const localOk = srcs.every((u) => /^(https?:)?\/\//.test(u) || exists(u));
      return remote.length === 0 && localOk;
    },
  },
  {
    id: 'worker-notebook-cap',
    claim: 'The Worker caps notebook_context before injecting it into the system prompt',
    check: () => {
      const s = read('cloudflare-worker/worker.js');
      return hasIdent(s, 'NOTEBOOK_CONTEXT_MAX_CHARS') && s.includes('.slice(0, NOTEBOOK_CONTEXT_MAX_CHARS)');
    },
  },
  {
    id: 'worker-db-cap',
    claim: 'The Worker caps db_context the same way it caps notebook_context',
    check: () => {
      const s = read('cloudflare-worker/worker.js');
      return hasIdent(s, 'DB_CONTEXT_MAX_CHARS') && s.includes('.slice(0, DB_CONTEXT_MAX_CHARS)');
    },
  },
  {
    id: 'worker-daily-cap-enforced',
    claim: 'The Worker enforces a per-isolate daily request ceiling (not just logs one)',
    check: () => {
      const s = read('cloudflare-worker/worker.js');
      return hasIdent(s, 'DAILY_MAX_PER_ISOLATE') && /dayEntry\.count\s*>=\s*DAILY_MAX_PER_ISOLATE/.test(s);
    },
  },
  {
    id: 'worker-key-server-side-only',
    claim: 'The Anthropic API key is only ever read server-side, never shipped to the browser',
    check: () => {
      const client = read('index.html');
      const worker = read('cloudflare-worker/worker.js');
      const leaked = /sk-ant-[A-Za-z0-9_-]{20,}/;
      return !leaked.test(client)
        && !leaked.test(worker)
        && !/ANTHROPIC_API_KEY/.test(client)
        && hasIdent(worker, 'ANTHROPIC_API_KEY');
    },
  },
  {
    id: 'notebook-mirror-present',
    claim: 'Notebook-X notebooks are mirrored into data/notebooks/ as same-origin static files',
    check: () => exists('data/notebooks')
      && fs.readdirSync(path.join(ROOT, 'data/notebooks')).some((f) => f.endsWith('.json')),
  },
  {
    id: 'notebook-sync-failure-visible',
    claim: 'A failed notebook sync writes to NEEDS_YOUR_REVIEW.md rather than failing silently',
    check: () => {
      const s = read('.github/workflows/notebook-sync.yml');
      return s.includes('if: failure()') && s.includes('NEEDS_YOUR_REVIEW.md');
    },
  },
  {
    id: 'workflows-registry',
    claim: 'Workflows are self-hosted via data/workflows.json pointing at workflows/',
    check: () => {
      if (!exists('data/workflows.json')) return false;
      const reg = JSON.parse(read('data/workflows.json'));
      const items = Array.isArray(reg) ? reg : (reg.workflows || []);
      // The registry field is `path` (matching the modules.json convention),
      // not `file` — an earlier version of this check guessed the field name
      // and reported drift that did not exist.
      return items.length > 0 && items.every((w) => w.path && exists(w.path));
    },
  },
  {
    id: 'master-not-main',
    claim: 'The default branch is master, and tooling refers to it as such',
    check: () => !/\borigin\/main\b/.test(read('automation/instructions_auditor.txt')),
  },
];

/* ────────────────────────────────────────────────────────────────────────── */


/* ────────────────────────────────────────────────────────────────────────────
 * SELF-TEST (`node spec-drift-check.js --self-test`)
 *
 * A drift checker that silently fails to detect drift is worse than no checker,
 * because it manufactures confidence. This mode mutates copies of the source in
 * memory and asserts each claim actually flips to false. It caught a real bug on
 * first use: the checks originally used String.includes(), so renaming
 * copyUsageCmd -> copyUsageCmdRENAMED still matched and reported green.
 * ──────────────────────────────────────────────────────────────────────────── */

function selfTest() {
  const cases = [
    ['copy-usage-rows', 'index.html', (s) => s.replace(/function copyUsageCmd\b/, 'function copyUsageCmdRENAMED')],
    ['copy-ai-code', 'index.html', (s) => s.replace(/function copyAiCode\b/, 'function copyAiCodeGone')],
    ['suggestion-parsing', 'index.html', (s) => s.replace(/function parseSuggestionBlocks\b/, 'function nope')],
    ['bookmarks-browse-ui', 'index.html', (s) => s.replace(/function renderBookmarksList\b/, 'function nope2')],
    ['tab-keyboard-nav', 'index.html', (s) => s.replace("case 'Home'", "case 'NotHome'")],
    ['zero-dependency-core', 'index.html', (s) => s.replace('<script>', '<script src="https://cdn.example.com/x.js"></script><script>')],
    ['no-issue-filing', 'index.html', (s) => s.replace('<script>', '<script>const u="https://api.github.com/repos/x/y/issues";')],
    ['worker-db-cap', 'cloudflare-worker/worker.js', (s) => s.replace(/DB_CONTEXT_MAX_CHARS/g, 'REMOVED_CAP')],
    ['worker-daily-cap-enforced', 'cloudflare-worker/worker.js', (s) => s.replace(/dayEntry\.count >= DAILY_MAX_PER_ISOLATE/, 'false')],
    ['worker-key-server-side-only', 'index.html', (s) => s.replace('<script>', '<script>const k="sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAA";')],
    ['notebook-sync-failure-visible', '.github/workflows/notebook-sync.yml', (s) => s.replace('if: failure()', 'if: always()')],
  ];

  const realRead = read;
  let bad = 0;
  console.log('=== self-test: does each check actually detect its own drift? ===\n');

  for (const [id, file, mutate] of cases) {
    const claim = claims.find((c) => c.id === id);
    if (!claim) { console.log(`?  no such claim: ${id}`); bad++; continue; }

    // Patch read() so the claim sees a mutated copy of one file.
    global.__patched = { file, mutate };
    const detected = !claim.check();
    global.__patched = null;

    if (detected) {
      console.log(`✓  ${id} — drift detected as expected`);
    } else {
      console.log(`✗  ${id} — MUTATED THE CODE AND THE CHECK STILL PASSED`);
      console.log(`      this check gives false confidence; tighten it.`);
      bad++;
    }
  }

  console.log(`\n${cases.length} mutations tried — ${bad} checks failed to notice.`);
  if (bad) { console.log('\nFix these before trusting a green run.'); process.exit(1); }
  console.log('\nEvery mutation was caught. ✓');
  process.exit(0);
}

if (process.argv.includes('--self-test')) selfTest();

let failures = 0;
let broken = 0;

console.log('=== CURRENT-SPEC.md drift check — every registered claim, every run ===\n');

for (const c of claims) {
  let ok;
  try {
    ok = c.check();
  } catch (err) {
    console.log(`✗  BROKEN CHECK  ${c.id}`);
    console.log(`      ${c.claim}`);
    console.log(`      the check itself threw: ${err.message}\n`);
    broken++;
    continue;
  }
  if (ok) {
    console.log(`✓  ${c.id}`);
  } else {
    console.log(`✗  DRIFT  ${c.id}`);
    console.log(`      spec says: ${c.claim}`);
    console.log(`      the code no longer matches. Update CURRENT-SPEC.md (and this`);
    console.log(`      registry) in the same commit as the code change.\n`);
    failures++;
  }
}

console.log(`\n${claims.length} claims checked — ${failures} drifted, ${broken} broken.`);

if (broken) {
  console.log('\nA broken check is not a pass. Fix the registry entry.');
  process.exit(2);
}
if (failures) {
  console.log('\nDoc drift is a hard rule violation for this project (CLAUDE.md).');
  process.exit(1);
}
console.log('\nNo drift. ✓');
