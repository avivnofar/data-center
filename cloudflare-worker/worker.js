/**
 * Data Center — Cloudflare Worker API proxy for the Anthropic API.
 *
 * This worker is the ONLY place the Anthropic API key exists. The static
 * frontend (GitHub Pages) calls this worker, which calls the Anthropic
 * Messages API and streams the response back as Server-Sent Events.
 *
 * Deploy: see cloudflare-worker/README.md
 */

const ALLOWED_ORIGINS = [
  'https://avivnofar.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
];

const RATE_LIMIT_MAX = 20; // requests per window per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// ── Hard input ceilings (cost containment) ────────────────────────────────────
// The Origin allowlist below is only enforceable against browsers; a direct
// (non-browser) request can set any Origin header it likes, so it cannot be
// treated as authentication. Until a real auth/attestation layer exists (see
// TURNSTILE support at the bottom of this file), these ceilings are what
// actually bounds the worst-case Anthropic spend per request and per day.
const MAX_BODY_BYTES = 6 * 1024 * 1024;   // whole request body (images dominate)
const MAX_MESSAGES = 40;                  // conversation turns per request
const MAX_MESSAGE_CHARS = 12000;          // chars per single message
const MAX_TOTAL_MESSAGE_CHARS = 60000;    // chars across all messages
const DB_CONTEXT_MAX_CHARS = 20000;       // parity with NOTEBOOK_CONTEXT_MAX_CHARS
const MAX_IMAGES = 3;                     // matches the vision injection below
const MAX_IMAGE_B64_CHARS = 2 * 1024 * 1024; // ~1.5 MB decoded, per image
// Circuit breaker: accepted requests per UTC day, counted PER ISOLATE.
// This is NOT a global cap. Workers run many independent isolates across edge
// locations and each keeps its own in-memory counter, so a distributed caller
// can exceed this by roughly the number of isolates it reaches — see SEC-02 in
// automation/NEEDS_YOUR_REVIEW.md. A real global ceiling needs a Durable Object
// or KV with TTL. Previously the daily counter was logged but never enforced.
const DAILY_MAX_PER_ISOLATE = 300;

const MODEL = 'claude-sonnet-5';

// ── Pricing, for the est_cost_usd field on the usage log line ────────────────
// Rates in USD per token, taken from https://platform.claude.com/docs/en/about-claude/pricing
// as read on 2026-08-04. claude-sonnet-5 is on introductory pricing through
// 2026-08-31 and reverts to standard pricing on 2026-09-01, so BOTH rate sets
// are encoded and selected by UTC date — otherwise every logged cost would
// silently understate spend by ~33% from September onward.
// Cache multipliers (1.25x write / 0.1x read) are already baked into these.
// These figures are an ESTIMATE for trend-watching, not a billing record; the
// Anthropic Console remains the source of truth.
const PRICING = {
  intro: { // through 2026-08-31
    input: 2.00 / 1e6,
    cache_write_5m: 2.50 / 1e6,
    cache_read: 0.20 / 1e6,
    output: 10.00 / 1e6,
  },
  standard: { // from 2026-09-01
    input: 3.00 / 1e6,
    cache_write_5m: 3.75 / 1e6,
    cache_read: 0.30 / 1e6,
    output: 15.00 / 1e6,
  },
  // Server-side web search: $10 per 1,000 searches, billed on top of tokens.
  web_search_per_request: 10.00 / 1000,
};
const PRICING_INTRO_LAST_DAY = '2026-08-31';

function priceSheet(dateKey) {
  return dateKey <= PRICING_INTRO_LAST_DAY ? PRICING.intro : PRICING.standard;
}

/**
 * Estimated USD cost of one Claude call from its usage object.
 * input_tokens counts only the tokens AFTER the last cache breakpoint — the
 * cached portion is billed separately via the two cache fields, so these three
 * are added, never max'd.
 */
function estimateCostUsd(usage, dateKey) {
  const p = priceSheet(dateKey);
  const cost =
    usage.input_tokens * p.input +
    usage.cache_creation_input_tokens * p.cache_write_5m +
    usage.cache_read_input_tokens * p.cache_read +
    usage.output_tokens * p.output +
    usage.web_search_requests * PRICING.web_search_per_request;
  // 6dp: a fully-cached short answer lands around $0.0009.
  return Math.round(cost * 1e6) / 1e6;
}
// 1536 (not 1024) leaves headroom for the required "Relevant commands to
// check:" / RELATED_COMMANDS closing section on long answers — at 1024 it
// was frequently truncated mid-answer before reaching that line.
const MAX_TOKENS = 1536;

// In-memory rate limiter. IMPORTANT LIMITATION: Workers run many independent
// isolates across edge locations, and each isolate has its own copy of this Map,
// which is also wiped on cold start. So this is a per-isolate soft limit, NOT a
// global guarantee — a distributed caller can exceed RATE_LIMIT_MAX by roughly
// the number of isolates it reaches. Making this a real global limit requires a
// Durable Object or KV with TTL; see cloudflare-worker/README.md.
const ipRequests = new Map();
// Daily global counter kept in its own Map (it used to share `ipRequests`,
// mixing two unrelated key namespaces in one structure).
const dailyCounts = new Map();

// Neither Map had any eviction, so both grew unbounded for the isolate's
// lifetime. Prune expired entries opportunistically.
function pruneRateLimitState(now) {
  if (ipRequests.size > 5000) {
    for (const [key, entry] of ipRequests) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) ipRequests.delete(key);
    }
  }
  if (dailyCounts.size > 7) {
    const keys = [...dailyCounts.keys()].sort();
    for (const key of keys.slice(0, keys.length - 2)) dailyCounts.delete(key);
  }
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  return headers;
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

function isRateLimited(ip) {
  const now = Date.now();
  pruneRateLimitState(now);
  const entry = ipRequests.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRequests.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

/**
 * One-way IP digest for logs. Replaces the previous btoa(ip) — Base64 is
 * reversible with atob(), so it provided no actual anonymization despite the
 * field being named ip_hash. Salted with LOG_SALT when available so digests
 * aren't reversible via a precomputed table of the IPv4 space.
 */
async function hashIp(ip, salt) {
  try {
    const data = new TextEncoder().encode(`${salt || 'data-center'}:${ip}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].slice(0, 6)
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (_) {
    return 'unavailable';
  }
}

/**
 * Optional Cloudflare Turnstile verification — the actual answer to "the Origin
 * header is not authentication."
 *
 * DORMANT BY DEFAULT: if env.TURNSTILE_SECRET is not set, this returns null and
 * nothing changes, so deploying this file alone cannot break the live app. Once
 * the secret exists, a valid turnstile_token becomes mandatory on every request,
 * which is what stops a scripted non-browser caller from spending the Anthropic
 * budget. See "Turnstile — two-step enablement" in cloudflare-worker/README.md
 * (frontend sends tokens first, secret second — it fails closed).
 */
async function verifyTurnstile(token, secret, ip) {
  if (!secret) return null; // feature not enabled — no behavior change
  if (!token || typeof token !== 'string') {
    return 'Verification required / נדרש אימות';
  }
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip && ip !== 'unknown') form.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const outcome = await res.json();
    if (!outcome.success) {
      return 'Verification failed / האימות נכשל';
    }
    return null;
  } catch (_) {
    // Fail closed: if verification is enabled it must actually gate access.
    return 'Verification unavailable / האימות אינו זמין';
  }
}

/**
 * Validate the client-supplied messages array. Previously the only check was
 * "is a non-empty array", so an unbounded conversation history (or a single
 * enormous message) could be submitted to inflate input-token cost.
 */
function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '"messages" must be a non-empty array';
  }
  if (messages.length > MAX_MESSAGES) {
    return `"messages" exceeds the maximum of ${MAX_MESSAGES} turns`;
  }
  let total = 0;
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      return 'each message must have role "user" or "assistant"';
    }
    let chars = 0;
    if (typeof m.content === 'string') {
      chars = m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block && typeof block.text === 'string') chars += block.text.length;
      }
    } else {
      return 'message content must be a string or an array of content blocks';
    }
    if (chars > MAX_MESSAGE_CHARS) {
      return `a single message exceeds the maximum of ${MAX_MESSAGE_CHARS} characters`;
    }
    total += chars;
  }
  if (total > MAX_TOTAL_MESSAGE_CHARS) {
    return `total conversation length exceeds ${MAX_TOTAL_MESSAGE_CHARS} characters`;
  }
  return null;
}

// Notebook-X content is a static mirror synced weekly into data/notebooks/
// (see .github/workflows/notebook-sync.yml) and selected client-side
// (matchNotebooks()/buildNotebookContext() in index.html) — the Worker stays
// a dumb proxy: no fetching, no KV, no GitHub credentials here. It only
// receives an already-built notebook_context string in the request body.
const NOTEBOOK_CONTEXT_MAX_CHARS = 20000; // defense in depth against a modified client

/**
 * Build the system prompt based on mode (search/diagnose), language (en/he),
 * the local DB context string injected by the frontend, CLI Mode, and an
 * optional Notebook-X reference context string (client-selected, mirrored
 * content — see notebookContext above).
 *
 * PROMPT CACHING (added 2026-08-04). Returns an ARRAY of system content blocks
 * ordered static-first, dynamic-last, because Anthropic's cache is a prefix
 * match: any byte that changes invalidates everything after it. Render order is
 * tools -> system -> messages, so the tools array (static) is covered by the
 * first system breakpoint for free.
 *
 *   [0] base      - static per language                    <- cache breakpoint
 *   [1] variant   - static per (language, mode, cliMode)   <- cache breakpoint
 *   [2] contexts  - db_context + notebook_context (per-request, NOT cached)
 *
 * Two breakpoints rather than one: block 0 is shared across all four
 * mode/cliMode combinations, so a diagnose request reads the cache a search
 * request wrote. It is NOT shared across languages — `Response language:` is
 * interpolated mid-base, so he/en are two separate cache entries. That line was
 * deliberately left where it is: hoisting it into block 1 would unify the two,
 * but it would also move a behavior-shaping instruction to a different position
 * in the prompt, which is a bigger change than a cache slot is worth. Language
 * is sticky per user (dc-lang in localStorage), so the fork costs one extra
 * cache write, not one per request.
 *
 * The prompt TEXT is unchanged from the pre-caching version — the CAPABILITIES
 * section simply moved ahead of db_context/notebook_context so that all static
 * text precedes all dynamic text. Nothing was reworded.
 *
 * Block 0 measures ~1.9k tokens, comfortably over claude-sonnet-5's 1024-token
 * minimum cacheable prefix (below that the cache silently does nothing).
 */
function systemBlocks(mode, language, dbContext, cliMode, notebookContext) {
  const langLabel = language === 'he' ? 'HEBREW' : 'ENGLISH';

  // ── Block 0: universal base. Do not interpolate anything per-request here. ──
  const base = `You are an expert IT support assistant with broad, deep knowledge
across the entire IT field. Your expertise includes but is not limited to:

CORE IT:
- Linux, Windows, macOS system administration
- Networking (routing, switching, firewalls, VPN, DNS, DHCP)
- Cloud platforms (AWS, Azure, GCP)
- Virtualization and containers (Docker, Kubernetes, VMware)
- Databases (SQL, NoSQL) and system architecture
- Scripting and automation (Bash, PowerShell, Python)

TELECOM & VOIP (Netvill's core business — always available):
- VoIP/SIP telephony, IP intercom, access control, PoE networking
- 1COM cloud PBX platform, MirtaPBX

CYBERSECURITY (growing focus area):
- Network security, firewall configuration, intrusion detection
- Vulnerability assessment concepts, security best practices
- Incident response fundamentals
- Common attack vectors and defensive measures
- Security auditing and compliance basics
Note: for hands-on offensive security techniques (penetration testing tools,
exploit development), provide educational and defensive-oriented guidance.
Always frame offensive security knowledge in terms of understanding threats
to build better defenses, consistent with ethical security practice.

You are not limited to Netvill's specific product line — help with any
legitimate IT question a technician or IT professional might have, from any
platform or technology. Always cite specific commands when answering. Be
concise and practical. Reference the local database context when relevant,
but your knowledge extends well beyond it — feel free to answer from your
general expertise when the local database doesn't cover a topic.
This is a compact chat UI, not a document: avoid heavy markdown decoration
(multiple "##" headers, horizontal rules, emoji section markers). Prefer one
short intro line, a code block with the key command(s), and brief explanation —
leave room for the required closing section described below.
Response language: ${langLabel}
When responding in Hebrew: use natural Israeli IT professional style —
Hebrew instructions, English technical terms (commands, flags, protocols, ports,
error messages, file paths) always in English inline.
Keep code blocks, commands, and flags in English regardless of response language.

You are deployed at Netvill — an Israeli B2B telecom hardware company. Netvill's
specialty (not a boundary on what you can help with) is VoIP/SIP telephony, IP
intercom systems, access control, PoE networking, and the 1COM cloud PBX
platform. When users are technicians and system integrators working on that
specialty, common issues include: SIP registration failures, NAT traversal
problems, codec negotiation, PoE power budgets, VLAN configuration for voice,
QoS settings, intercom wiring (2-wire vs SIP), 1COM extension setup, and field
troubleshooting of IP devices.
When asked about SIP, always mention both Linux (Asterisk/FreePBX) and
the 1COM platform where relevant.

ADDITIONAL PLATFORMS — NETVILL SPECIALTY:
Beyond the 1COM basics above, two platforms have dedicated knowledge-base
modules:
- 1COM (data/1com.json, https://1com.co.il): full cloud PBX — IP phone/ATA
  hardware (Rainbow1/2/4, Biz28, W56 DECT), auto-provisioning, extensions,
  IVR/auto-attendant and time-based call routing, call queues/call center
  (Ring All/Round Robin/Fewest Calls, Call Back), Wow-Chat omnichannel
  (WhatsApp/web chat/email unified inbox), Smart Monitoring real-time
  dashboards, call recording, user roles/permissions, and CRM screen-pop
  integration.
- MirtaPBX (data/mirtapbx.json, https://mirtapbx.com): Asterisk-based
  multitenant cloud PBX infrastructure — 3-layer architecture (UI/
  provisioning, centralized MySQL Realtime DB, Asterisk node cluster),
  tenant isolation, cluster node addition, load balancing via Tenant
  Variables (cold migration), SIP registration troubleshooting, recording
  storage via Google Drive, QueueMetrics-Live integration, and WebRTC
  browser clients.

CRITICAL MirtaPBX reporting distinction — CDR vs sc_simplecdr: the standard
CDR table marks a call "ANSWERED" the moment SIP-level answer occurs,
including when a caller enters queue hold (Music-on-Hold) — this inflates
call-center answer rates. The sc_simplecdr table only counts a call as
answered when an actual agent bridge occurs. For any "did a human answer"
call-center reporting question, point users to sc_simplecdr, not CDR, and
explain this distinction if their question implies they're using CDR for
that purpose.

When a question involves 1COM or MirtaPBX, prefer source_url citations from
1com.co.il, mirtapbx.com, or queuemetrics.com and the matching
data/1com.json or data/mirtapbx.json entries.

LOCAL DATABASE QUICK REFERENCE — the app's knowledge base has command cards for:
- Linux (data/linux.json): network (netstat, ss, ping, traceroute, curl, tcpdump,
  iptables, ip, fail2ban), process (ps, top, kill, strace, nice/renice, pgrep/pstree),
  disk (df, du, find, lsof, tar, lsblk, fdisk, smartctl, ncdu, iotop),
  permission (chmod, chown, sudo, auditd/ausearch), system (systemctl, cron, free,
  dmesg, vmstat), logs (journalctl, grep, awk, sed, tail -f), user (useradd, last, who/w)
- Windows CMD/PowerShell (data/cmd.json): network (ipconfig, netstat, ping, tracert,
  nslookup, netsh, nbtstat, pathping, Test-NetConnection), process (tasklist, taskkill),
  disk (diskpart, chkdsk, fsutil), system (wmic, sc, reg, wevtutil, net start/stop,
  systeminfo, driverquery), user (net user, auditpol, gpresult, whoami)
- Cross-platform network tools (data/network.json): ports (nmap, telnet),
  dns (dig, nslookup, whois, getent, host), diagnostic (mtr, netcat, wget, openssl,
  iperf3, arp, tshark, ethtool, nmcli, asterisk-cli-basics, freepbx-troubleshoot),
  routing (route), firewall (iptables, ufw, Windows Defender Firewall),
  voip (sip-registration-troubleshoot, rtp-port-range, sip-nat-traversal,
  vlan-voice, qos-dscp-voip, poe-troubleshoot, sip-options-keepalive,
  1com-sip-trunk)
- 1COM cloud PBX (data/1com.json): hardware (IP phone registration, ATA analog
  adapters, supported phone models, auto-provisioning, extension registration
  and no-audio diagnosis), config (extensions management, call recording,
  user roles/permissions), ivr (IVR/auto-attendant setup, time-based call
  routing, IVR routing issues), queue (call center setup, queue not
  distributing), omnichannel (Wow-Chat), monitoring (real-time dashboards),
  integration (CRM screen-pop issues)
- MirtaPBX (data/mirtapbx.json): architecture (architecture overview,
  Realtime DB vs flat config, multitenant tenant isolation), cluster (adding
  a cluster node, load balancing via Tenant Variables), sip (SIP registration
  failure, config change not taking effect), recording (Google Drive
  storage), reporting (CDR vs sc_simplecdr), integration (QueueMetrics-Live),
  webrtc (browser WebRTC client)
- Troubleshoot scenarios (data/troubleshoot.json): step-by-step guides for SSH
  issues, disk full, service crashes, high CPU/memory, no internet, port conflicts,
  Windows blue screen, permission denied, DNS resolution, time sync, VPN/internal
  access, web service unreachable, AD login failures, SSL certificate errors,
  SIP registration failures, one-way audio (RTP), PoE intercom power issues,
  1COM extension registration/audio/routing issues, and MirtaPBX config-not-
  applying / CDR-vs-sc_simplecdr reporting issues.
When a user's question matches one of these commands or scenarios, prefer citing
the exact command names above (even if no db_context is provided below) so the
app can cross-link to the matching card.`;

  // ── Block 1: static per language/mode/cliMode. Still no per-request data. ──
  let variant = '';

  if (language === 'he') {
    variant += `

Hebrew responses must be especially concise: 2-4 short paragraphs or a short
bulleted list, maximum. Don't repeat the question and don't restate background
theory the user didn't ask for — get to the relevant commands and the fix quickly.`;
  }

  if (mode === 'diagnose') {
    variant += `

The user wants guided diagnosis. Be aggressive about narrowing down the problem
fast: each turn, ask exactly ONE targeted question paired with ONE specific
command for the user to run right now, and end the turn by asking what output
they got (in the response language). Do not list multiple possible causes or
multiple commands in the same turn — pick the single most likely next step.
Once you have enough information, give the final fix as a numbered list of
steps, each with the exact command to run.`;
  } else {
    variant += `

The user is doing a free search. Answer their question directly and completely.
Always end your answer with a line "Relevant commands to check:" (in the response
language, e.g. Hebrew: "פקודות רלוונטיות לבדיקה:") followed by 2-3 specific command
names from the local database quick reference above (or db_context if provided)
that the user should look up next. Then, on a new line, write:
RELATED_COMMANDS: [comma-separated command names]
so the frontend can highlight relevant database entries.`;
  }

  if (cliMode) {
    variant += `

CLI Mode is active. Prioritize exact commands and flags over prose.
Lead with the command(s) in a code block, then at most 1-2 short lines of
explanation. Avoid background theory unless the user explicitly asks for it.`;
  }

  variant += `

You can analyze screenshots and images. When a user shares a screenshot of an
error, config page, or terminal output, describe what you see and provide
specific troubleshooting steps. For 1COM or MirtaPBX screenshots: identify
the exact screen, settings page, or error shown and give precise instructions.`;

  // CAPABILITIES moved ahead of db_context/notebook_context (2026-08-04) so the
  // cached prefix ends here. Text itself is unchanged.
  variant += `

CAPABILITIES:
- A web_search tool is available. Use it when your training data may be
  outdated, or the user asks about current versions, recent CVEs, or
  something not covered by the local knowledge base. Prefer official
  documentation domains: man7.org, learn.microsoft.com, docs.microsoft.com,
  ss64.com, linux.org, kernel.org, iana.org, rfc-editor.org, nmap.org,
  wireshark.org, ubuntu.com, redhat.com, debian.org, cloudflare.com,
  cisco.com, tcpdump.org, iperf.fr, software.es.net, asterisk.org, 1com.co.il,
  mirtapbx.com, queuemetrics.com. Treat any other
  domain, or an unfamiliar publisher, with caution: verify against an
  official source before relying on it, and never present an unverified
  claim as fact.
- If this session exposed a genuine, specific gap in the knowledge base (a
  missing command, module, file type, or schema field — not a vague "could
  be more"), end your response with a line "---" followed by:
    CAPABILITY_SUGGESTION: {"type": "...", "summary": "...", "proposed_change": "...", "affected_files": ["..."]}
- If a web_search result surfaced a source worth adding as a source_url for
  an existing command/category, end your response with:
    LEARNED_SOURCE: {"url": "...", "proposed_field": "linux.json:netstat.source_url", "reason": "..."}
  Only propose sources from the approved-domain list above. Never propose
  stackoverflow.com, reddit.com, medium.com, youtube.com, github.com,
  geeksforgeeks.org, w3schools.com, or *.blogspot.com.
Both suggestion blocks are optional, machine-readable hints for the app —
omit them entirely on most responses. They are proposals only; a human
reviews them before anything changes.`;

  // ── Block 2: per-request. Everything below the last breakpoint. ──
  let contexts = '';

  if (dbContext && dbContext.trim()) {
    contexts += `\n\n${dbContext.trim()}`;
  }

  if (notebookContext && notebookContext.trim()) {
    contexts += `\n\nNOTEBOOK-X REFERENCE CONTENT (mirrored, may be up to a week old):\n` +
      `The following is supplementary reference material selected from Notebook-X ` +
      `knowledge notebooks based on the user's question. Cite it when used, but it ` +
      `may not cover everything — web_search remains available for anything it doesn't cover.\n\n` +
      notebookContext.trim();
  }

  const blocks = [
    { type: 'text', text: base, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: variant, cache_control: { type: 'ephemeral' } },
  ];
  // Only append when non-empty: a zero-length text block is rejected by the API,
  // and an empty-but-present block would still be a distinct trailing element.
  if (contexts) blocks.push({ type: 'text', text: contexts });

  return blocks;
}

/**
 * Re-stream the Anthropic SSE response into the simplified format the
 * frontend expects: data: {"delta": "..."}\n\n ... data: {"done": true}\n\n
 *
 * Also sniffs the usage object out of the stream on the way past. In streaming
 * mode usage arrives in two places (per the Anthropic streaming docs):
 *   message_start -> message.usage : input_tokens + both cache fields
 *   message_delta -> usage         : output_tokens (cumulative), and on newer
 *                                    API versions a repeat of the input fields
 * Values are assigned last-wins rather than summed, because message_delta
 * reports a running total, not a per-event increment.
 *
 * `onUsage` fires from flush(), i.e. once the upstream stream has ended. If the
 * browser disconnects mid-answer the flush never runs and no usage line is
 * logged — the claude_api_call line emitted before the fetch is what guarantees
 * every spend event is still visible.
 */
function streamAnthropicResponse(onUsage) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    web_search_requests: 0,
  };
  let sawUsage = false;

  function mergeUsage(u) {
    if (!u || typeof u !== 'object') return;
    sawUsage = true;
    for (const key of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) {
      if (typeof u[key] === 'number') usage[key] = u[key];
    }
    if (u.server_tool_use && typeof u.server_tool_use.web_search_requests === 'number') {
      usage.web_search_requests = u.server_tool_use.web_search_requests;
    }
  }

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        let event;
        try {
          event = JSON.parse(data);
        } catch (_) {
          continue;
        }

        if (event.type === 'content_block_delta' && event.delta && event.delta.type === 'text_delta') {
          const payload = JSON.stringify({ delta: event.delta.text });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } else if (event.type === 'message_start') {
          mergeUsage(event.message && event.message.usage);
        } else if (event.type === 'message_delta') {
          mergeUsage(event.usage);
        } else if (event.type === 'message_stop') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      if (onUsage && sawUsage) {
        try {
          onUsage(usage);
        } catch (_) { /* logging must never break the response */ }
      }
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.includes(origin)) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (url.pathname !== '/api/chat' || request.method !== 'POST') {
      return jsonResponse({ error: 'not_found', message: 'Not found' }, 404, origin);
    }

    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return jsonResponse({
        error: 'rate_limit',
        message: 'Too many requests. Please wait a minute. / יותר מדי בקשות. המתן דקה.',
      }, 429, origin);
    }

    // Reject oversized bodies before reading/parsing them. Content-Length is a
    // client-supplied hint, so the actual read below is also length-checked.
    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return jsonResponse({
        error: 'general',
        message: 'Request body too large / גוף הבקשה גדול מדי',
      }, 413, origin);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) {
        return jsonResponse({
          error: 'general',
          message: 'Request body too large / גוף הבקשה גדול מדי',
        }, 413, origin);
      }
      body = JSON.parse(raw);
    } catch (_) {
      return jsonResponse({ error: 'general', message: 'Invalid JSON body' }, 400, origin);
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'general', message: 'Body must be a JSON object' }, 400, origin);
    }

    const { messages, mode, language, db_context, notebook_context, cli_mode, images } = body;

    const messagesError = validateMessages(messages);
    if (messagesError) {
      return jsonResponse({ error: 'general', message: messagesError }, 400, origin);
    }

    // Bot/attestation check (no-op unless TURNSTILE_SECRET is configured).
    const turnstileError = await verifyTurnstile(body.turnstile_token, env.TURNSTILE_SECRET, ip);
    if (turnstileError) {
      return jsonResponse({ error: 'auth', message: turnstileError }, 403, origin);
    }

    // Global daily circuit breaker — enforced, not just logged. Bounds the
    // worst-case daily spend if the endpoint is discovered and scripted against.
    //
    // The counter is CHECKED here (fail fast) but only INCREMENTED immediately
    // before the Anthropic call, further down. Incrementing here instead would
    // have turned this protection into a cheap denial-of-service: a caller
    // could burn all DAILY_MAX_PER_ISOLATE slots with requests that get rejected
    // later in validation — costing them nothing, costing Anthropic nothing,
    // and taking the site down for the rest of the day. The cap exists to
    // bound spend, so it must count spend events, not arrivals.
    const todayKey = new Date().toISOString().split('T')[0];
    const dayEntry = dailyCounts.get(todayKey) || { count: 0 };
    if (dayEntry.count >= DAILY_MAX_PER_ISOLATE) {
      console.log(JSON.stringify({
        event: 'isolate_daily_cap_reached', date: todayKey,
        cap_per_isolate: DAILY_MAX_PER_ISOLATE,
      }));
      return jsonResponse({
        error: 'rate_limit',
        message: 'Daily capacity reached. Try again tomorrow. / הגעת למכסה היומית. נסה מחר.',
      }, 429, origin);
    }

    const trimmedNotebookContext = typeof notebook_context === 'string'
      ? notebook_context.slice(0, NOTEBOOK_CONTEXT_MAX_CHARS)
      : '';
    // db_context is just as client-controlled as notebook_context and was
    // previously injected into the system prompt with no length limit at all.
    const trimmedDbContext = typeof db_context === 'string'
      ? db_context.slice(0, DB_CONTEXT_MAX_CHARS)
      : '';
    const system = systemBlocks(mode === 'diagnose' ? 'diagnose' : 'search', language === 'he' ? 'he' : 'en', trimmedDbContext, !!cli_mode, trimmedNotebookContext);

    // If images are attached, inject them into the last user message as
    // vision content blocks (max 3 images, base64 encoded).
    let apiMessages = messages;
    if (Array.isArray(images) && images.length > 0) {
      // Previously images were passed through with no per-image size check and
      // an arbitrary client-supplied media_type.
      const ALLOWED_MEDIA = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      const validImages = images
        .filter((img) => img && typeof img.data === 'string'
          && img.data.length <= MAX_IMAGE_B64_CHARS
          && ALLOWED_MEDIA.includes(img.media_type || 'image/png'))
        .slice(0, MAX_IMAGES);
      if (validImages.length !== Math.min(images.length, MAX_IMAGES)) {
        return jsonResponse({
          error: 'general',
          message: 'One or more images are too large or of an unsupported type / תמונה גדולה מדי או בפורמט שאינו נתמך',
        }, 400, origin);
      }
      const lastUserIdx = [...messages].map((m, i) => ({ m, i })).filter(({ m }) => m.role === 'user').pop()?.i;
      if (lastUserIdx !== undefined) {
        const imageBlocks = validImages.map((img) => ({
          type: 'image',
          source: { type: 'base64', media_type: img.media_type || 'image/png', data: img.data },
        }));
        const lastMsg = messages[lastUserIdx];
        const textContent = typeof lastMsg.content === 'string' ? lastMsg.content : (lastMsg.content?.[0]?.text || '');
        apiMessages = [
          ...messages.slice(0, lastUserIdx),
          { role: 'user', content: [...imageBlocks, { type: 'text', text: textContent }] },
          ...messages.slice(lastUserIdx + 1),
        ];
      }
    }

    // Commit a daily slot only now, at the point we actually spend money.
    // Everything above this line is free to reject.
    dayEntry.count++;
    dailyCounts.set(todayKey, dayEntry);

    // Usage logging — Cloudflare Workers Logs (Observability → Logs). No user
    // content logged, only metadata, so spikes can be attributed later. Emitted
    // here rather than earlier so that an event named claude_api_call always
    // corresponds to a call that was genuinely made, and daily_count always
    // matches the committed counter.
    // req_id correlates this line with the claude_api_usage line emitted once
    // the response has finished streaming (usage isn't known until then).
    const reqId = crypto.randomUUID().slice(0, 8);

    console.log(JSON.stringify({
      event: 'claude_api_call',
      req_id: reqId,
      timestamp: new Date().toISOString(),
      ip_hash: await hashIp(ip, env.LOG_SALT),
      mode: mode === 'diagnose' ? 'diagnose' : 'search',
      language: language === 'he' ? 'he' : 'en',
      has_images: !!(images && images.length),
      db_context_chars: (db_context || '').length,
      notebook_context_chars: (notebook_context || '').length,
      isolate_daily_count: dayEntry.count,
    }));

    if (dayEntry.count % 10 === 0) {
      console.log(JSON.stringify({
        event: 'isolate_daily_milestone',
        date: todayKey,
        isolate_total_calls: dayEntry.count,
      }));
    }

    let anthropicResponse;
    try {
      anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages: apiMessages,
          stream: true,
          // Server-side web search — capped per request to bound cost
          // (see CLAUDE.md "Launch Decisions" cost ceiling).
          //
          // _20260209 adds dynamic filtering: Claude writes and runs code that
          // filters search results before they enter the context window, which
          // cuts input tokens on search-heavy answers. It works by defaulting
          // allowed_callers to ["code_execution_20260120"] — the API provisions
          // that code execution itself, so code_execution must NOT be declared
          // here (a second execution environment confuses the model, and there
          // is no extra charge for the provisioned one). Left at the default
          // deliberately. Requires a 4.6+ model; claude-sonnet-5 qualifies.
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        }),
      });
    } catch (err) {
      return jsonResponse({ error: 'general', message: err.message }, 502, origin);
    }

    if (!anthropicResponse.ok) {
      let message = `Anthropic API error (${anthropicResponse.status})`;
      try {
        const errBody = await anthropicResponse.json();
        if (errBody.error && errBody.error.message) message = errBody.error.message;
      } catch (_) { /* ignore */ }

      if (anthropicResponse.status === 429) {
        return jsonResponse({ error: 'rate_limit', message: 'Too many requests, wait a moment' }, 429, origin);
      }
      if (anthropicResponse.status === 401) {
        return jsonResponse({ error: 'auth', message: 'API key issue' }, 401, origin);
      }
      return jsonResponse({ error: 'general', message }, anthropicResponse.status, origin);
    }

    const stream = anthropicResponse.body.pipeThrough(streamAnthropicResponse((usage) => {
      const cachedIn = usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
      const totalIn = usage.input_tokens + cachedIn;
      console.log(JSON.stringify({
        event: 'claude_api_usage',
        req_id: reqId,
        timestamp: new Date().toISOString(),
        model: MODEL,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
        // Share of input served from cache — the headline caching metric.
        cache_hit_ratio: totalIn > 0 ? Math.round((usage.cache_read_input_tokens / totalIn) * 100) / 100 : 0,
        web_search_requests: usage.web_search_requests,
        est_cost_usd: estimateCostUsd(usage, todayKey),
        pricing: todayKey <= PRICING_INTRO_LAST_DAY ? 'intro' : 'standard',
      }));
    }));

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders(origin),
      },
    });
  },
};
