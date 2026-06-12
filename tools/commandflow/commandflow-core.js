/* CommandFlow core — shared terminal-simulation engine.
 * Used by tools/commandflow/index.html (standalone "Terminal Academy") and by
 * CLI mode in the main app's index.html. Keep this file dependency-free
 * (no Tailwind, no build step) so both can load it directly via <script>.
 */
(function (global) {
  'use strict';

  let dbCache = null;
  let dbPromise = null;

  function loadDb(url) {
    if (dbCache) return Promise.resolve(dbCache);
    if (dbPromise) return dbPromise;
    dbPromise = fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load commands.json: ' + res.status);
        return res.json();
      })
      .then(data => { dbCache = data; return data; });
    return dbPromise;
  }

  function platforms(db) {
    return Object.keys(db).filter(k => k !== '_meta');
  }

  function tokenize(line) {
    return line.trim().split(/\s+/).filter(Boolean);
  }

  // Look up a command entry: try the full trimmed line first (for multi-word
  // commands like "show ip route" or "SELECT * FROM users;"), then fall back
  // to the first token (for "ls", "ls -la" -> "ls" if no exact match).
  function lookup(platformDb, line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (platformDb.commands[trimmed]) return platformDb.commands[trimmed];
    const [head] = tokenize(trimmed);
    if (head && platformDb.commands[head]) return platformDb.commands[head];
    return null;
  }

  // Returns { matched, output, isHelp, isClear } for a single input line.
  // - "clear"/"cls" -> isClear: true (caller should clear the screen)
  // - "help"/"?"    -> isHelp: true, output is the command list for the platform
  // - known command -> matched: true, output is the simulated output (string, possibly empty)
  // - unknown input -> matched: false, output is the platform's "unknown command" message
  function run(platformDb, line) {
    const trimmed = line.trim();
    const head = (tokenize(trimmed)[0] || '').toLowerCase();

    if (head === 'clear' || head === 'cls') {
      return { matched: true, isClear: true, output: '' };
    }

    if (head === 'help' || trimmed === '?') {
      const names = Object.keys(platformDb.commands).sort();
      return { matched: true, isHelp: true, output: names.join('\n') };
    }

    const entry = lookup(platformDb, trimmed);
    if (entry) {
      return { matched: true, output: (entry.output || []).join('\n') };
    }

    const cmdName = tokenize(trimmed)[0] || trimmed;
    const fallback = platformDb.unknown || '{cmd}: command not found';
    return { matched: false, output: fallback.split('{cmd}').join(cmdName) };
  }

  function commandList(platformDb) {
    return Object.keys(platformDb.commands).sort();
  }

  global.CommandFlow = { loadDb, platforms, run, lookup, tokenize, commandList };
})(typeof window !== 'undefined' ? window : globalThis);
