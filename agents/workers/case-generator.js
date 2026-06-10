/**
 * Data Center — AI Agent Simulation — case generator.
 *
 * Produces IT support cases inspired by Netvill IT scenarios (netvill.co),
 * covering the categories already present in data/linux.json,
 * data/cmd.json, and data/network.json so generated cases stay solvable
 * via the live app's knowledge base.
 *
 * Status: DRAFT (Phase 1 foundation) — CASE_POOL is a representative
 * starter set; .github/workflows/agent-cases.yml expands this weekly.
 */

const CASE_POOL = [
  // linux.json categories: network, process, disk, permission, system, logs, user
  { title: 'Web service fails to bind to its configured port', platform: 'linux', category: 'network', difficulty: 'beginner', description: 'A newly deployed service refuses to start, logging "address already in use". Identify the conflicting process and resolve it.' },
  { title: 'Runaway process consuming all CPU cores', platform: 'linux', category: 'process', difficulty: 'advanced', description: 'A background job has pegged every CPU core for over an hour. Identify it, determine if it is safe to kill, and remediate.' },
  { title: 'Application crashes due to full disk', platform: 'linux', category: 'disk', difficulty: 'intermediate', description: 'An application crashes on write with "No space left on device". Find what is consuming disk space and free it safely.' },
  { title: '"Permission denied" writing to shared directory', platform: 'linux', category: 'permission', difficulty: 'beginner', description: 'A user cannot write to a shared project directory despite being in the right group. Investigate ownership, group, and ACLs.' },
  { title: 'Service fails to start after package upgrade', platform: 'linux', category: 'system', difficulty: 'intermediate', description: 'After a routine package upgrade, a critical service no longer starts. Check unit status, logs, and config compatibility.' },
  { title: 'Application log file grows without bound', platform: 'linux', category: 'logs', difficulty: 'intermediate', description: 'A service log has filled the disk overnight. Identify the cause, rotate the log, and prevent recurrence.' },
  { title: 'New employee account missing required group', platform: 'linux', category: 'user', difficulty: 'beginner', description: 'A new hire cannot access a shared resource because their account is missing from the expected group.' },

  // cmd.json categories: network, process, disk, system, user
  { title: 'Windows host cannot reach the file server', platform: 'windows', category: 'network', difficulty: 'beginner', description: 'A workstation can browse the internet but cannot reach an internal file server by hostname. Diagnose connectivity and name resolution.' },
  { title: 'Explorer.exe repeatedly crashing', platform: 'windows', category: 'process', difficulty: 'intermediate', description: 'A user reports Explorer restarting every few minutes after a Windows Update. Identify the offending process/module and restore stability.' },
  { title: 'C: drive nearly full on a workstation', platform: 'windows', category: 'disk', difficulty: 'beginner', description: 'A workstation is showing low-disk-space warnings. Identify large/unnecessary files and free space safely.' },
  { title: 'Scheduled task silently failing', platform: 'windows', category: 'system', difficulty: 'intermediate', description: 'A nightly scheduled backup task shows as "Ready" but never produces output. Diagnose why it is not running.' },
  { title: 'User locked out of domain account', platform: 'windows', category: 'user', difficulty: 'beginner', description: 'A user is locked out after multiple failed login attempts from an unfamiliar device. Investigate and unlock safely.' },

  // network.json categories: diagnostic, ports, routing, dns, firewall
  { title: 'Intermittent packet loss to a remote site', platform: 'network', category: 'diagnostic', difficulty: 'advanced', description: 'Users report intermittent slowness reaching a branch office. Trace the path and isolate where loss is occurring.' },
  { title: 'Port 443 unreachable from one VLAN only', platform: 'network', category: 'ports', difficulty: 'intermediate', description: 'A new internal HTTPS service is reachable from most VLANs but times out from one specific VLAN.' },
  { title: 'Suspected routing loop between two sites', platform: 'network', category: 'routing', difficulty: 'advanced', description: 'Two sites occasionally lose all connectivity with a spike in latency just before. A routing loop is suspected.' },
  { title: 'Internal hostnames resolve inconsistently', platform: 'network', category: 'dns', difficulty: 'intermediate', description: 'Some clients resolve an internal hostname correctly while others get NXDOMAIN. Trace the resolution path.' },
  { title: 'New service blocked by firewall on one segment', platform: 'network', category: 'firewall', difficulty: 'advanced', description: 'A newly deployed API is reachable from the server VLAN but blocked from the office VLAN. Trace the rule chain.' },

  // troubleshoot.json-style cross-platform scenarios
  { title: 'VPN tunnel drops every few hours', platform: 'cross-platform', category: 'network', difficulty: 'advanced', description: 'A site-to-site VPN tunnel renegotiates and drops every 2-3 hours, briefly cutting connectivity. Diagnose the cause.' },
  { title: 'Backup job leaves stale lock file', platform: 'cross-platform', category: 'system', difficulty: 'intermediate', description: 'A nightly backup job fails with "lock file exists" after a previous run was killed mid-job.' },
  { title: 'Time drift causing authentication failures', platform: 'cross-platform', category: 'system', difficulty: 'intermediate', description: 'Several servers are intermittently failing Kerberos/SSO authentication. Suspect clock drift between hosts.' },
];

function pad(n, len) {
  return String(n).padStart(len, '0');
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * @param {number} count - how many cases to generate
 * @param {object} [opts]
 * @param {number} [opts.weekNumber] - ISO week number, used in generated IDs
 * @param {number} [opts.year]
 * @param {number} [opts.startIndex] - first sequence number for IDs (default 1)
 * @returns {Array<object>} cases matching the `cases` table schema (minus auto fields)
 */
export function generateCaseBatch(count, { weekNumber, year, startIndex = 1 } = {}) {
  const now = new Date();
  const w = weekNumber ?? isoWeekNumber(now);
  const y = year ?? now.getFullYear();

  const cases = [];
  for (let i = 0; i < count; i++) {
    const template = randomItem(CASE_POOL);
    const seq = startIndex + i;
    cases.push({
      id: `case-${y}-w${pad(w, 2)}-${pad(seq, 4)}`,
      title: template.title,
      platform: template.platform,
      difficulty: template.difficulty,
      category: template.category,
      description: template.description,
      status: 'open',
    });
  }
  return cases;
}

function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export { CASE_POOL };
