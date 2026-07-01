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

const MODEL = 'claude-sonnet-5';
// 1536 (not 1024) leaves headroom for the required "Relevant commands to
// check:" / RELATED_COMMANDS closing section on long answers — at 1024 it
// was frequently truncated mid-answer before reaching that line.
const MAX_TOKENS = 1536;

// In-memory rate limiter. Resets whenever the worker isolate restarts —
// acceptable for a soft per-IP limit on the free tier.
const ipRequests = new Map();

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
  const entry = ipRequests.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRequests.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

/**
 * Fetch the Notebook-X public index and return a short context string
 * listing complete/partial notebooks for injection into the system prompt.
 * Fails gracefully — returns "" if GitHub is unreachable.
 */
async function getNotebookXContext() {
  const indexUrl =
    'https://raw.githubusercontent.com/avivnofar/Notebook-X/main/notebooks/_index-public.json';
  try {
    const res = await fetch(indexUrl, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!res.ok) return '';
    const index = await res.json();
    const notebooks = (index.notebooks || []).filter(
      (n) => n.dataQuality === 'complete' || n.dataQuality === 'partial' || n.dataQuality === 'verified'
    );
    if (!notebooks.length) return '';
    const lines = notebooks
      .map((n) => `- ${n.name} (${n.domain}): ${n.summary}`)
      .join('\n');
    return (
      '\n\nNOTEBOOK-X REFERENCE NOTEBOOKS:\n' +
      'The following in-depth knowledge notebooks are maintained in Notebook-X. ' +
      'When a user question falls squarely in one of these domains and would benefit ' +
      'from specific commands or step-by-step procedures beyond what the local DB covers, ' +
      'mention that more detailed reference material exists:\n' +
      lines
    );
  } catch (_) {
    return '';
  }
}

/**
 * Build the system prompt based on mode (search/diagnose), language (en/he),
 * the local DB context string injected by the frontend, CLI Mode, and an
 * optional Notebook-X context string injected at request time.
 */
function systemPrompt(mode, language, dbContext, cliMode, notebookXContext) {
  const langLabel = language === 'he' ? 'HEBREW' : 'ENGLISH';

  let prompt = `You are an expert IT support assistant with broad, deep knowledge
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

  if (language === 'he') {
    prompt += `

Hebrew responses must be especially concise: 2-4 short paragraphs or a short
bulleted list, maximum. Don't repeat the question and don't restate background
theory the user didn't ask for — get to the relevant commands and the fix quickly.`;
  }

  if (mode === 'diagnose') {
    prompt += `

The user wants guided diagnosis. Be aggressive about narrowing down the problem
fast: each turn, ask exactly ONE targeted question paired with ONE specific
command for the user to run right now, and end the turn by asking what output
they got (in the response language). Do not list multiple possible causes or
multiple commands in the same turn — pick the single most likely next step.
Once you have enough information, give the final fix as a numbered list of
steps, each with the exact command to run.`;
  } else {
    prompt += `

The user is doing a free search. Answer their question directly and completely.
Always end your answer with a line "Relevant commands to check:" (in the response
language, e.g. Hebrew: "פקודות רלוונטיות לבדיקה:") followed by 2-3 specific command
names from the local database quick reference above (or db_context if provided)
that the user should look up next. Then, on a new line, write:
RELATED_COMMANDS: [comma-separated command names]
so the frontend can highlight relevant database entries.`;
  }

  if (cliMode) {
    prompt += `

CLI Mode is active. Prioritize exact commands and flags over prose.
Lead with the command(s) in a code block, then at most 1-2 short lines of
explanation. Avoid background theory unless the user explicitly asks for it.`;
  }

  prompt += `

You can analyze screenshots and images. When a user shares a screenshot of an
error, config page, or terminal output, describe what you see and provide
specific troubleshooting steps. For 1COM or MirtaPBX screenshots: identify
the exact screen, settings page, or error shown and give precise instructions.`;

  if (dbContext && dbContext.trim()) {
    prompt += `\n\n${dbContext.trim()}`;
  }

  if (notebookXContext && notebookXContext.trim()) {
    prompt += notebookXContext;
  }

  prompt += `

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

  return prompt;
}

/**
 * Re-stream the Anthropic SSE response into the simplified format the
 * frontend expects: data: {"delta": "..."}\n\n ... data: {"done": true}\n\n
 */
function streamAnthropicResponse(anthropicBody) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

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
        } else if (event.type === 'message_stop') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
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

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ error: 'general', message: 'Invalid JSON body' }, 400, origin);
    }

    const { messages, mode, language, db_context, cli_mode, images } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'general', message: '"messages" must be a non-empty array' }, 400, origin);
    }

    // Usage logging — Cloudflare Workers Logs (Observability → Logs). No
    // user content logged, only metadata, so spikes can be attributed later.
    console.log(JSON.stringify({
      event: 'claude_api_call',
      timestamp: new Date().toISOString(),
      ip_hash: btoa(ip).slice(0, 8),
      mode: body.mode || 'search',
      language: body.language || 'he',
      has_images: !!(body.images && body.images.length),
      db_context_chars: (body.db_context || '').length,
    }));

    const today = new Date().toISOString().split('T')[0];
    const dayKey = 'day-' + today;
    const dayCount = (ipRequests.get(dayKey) || { count: 0 }).count + 1;
    ipRequests.set(dayKey, { count: dayCount });
    if (dayCount % 10 === 0) {
      console.log(JSON.stringify({
        event: 'daily_milestone',
        date: today,
        total_calls: dayCount,
      }));
    }

    const notebookXContext = await getNotebookXContext();
    const system = systemPrompt(mode === 'diagnose' ? 'diagnose' : 'search', language === 'he' ? 'he' : 'en', db_context || '', !!cli_mode, notebookXContext);

    // If images are attached, inject them into the last user message as
    // vision content blocks (max 3 images, base64 encoded).
    let apiMessages = messages;
    if (Array.isArray(images) && images.length > 0) {
      const lastUserIdx = [...messages].map((m, i) => ({ m, i })).filter(({ m }) => m.role === 'user').pop()?.i;
      if (lastUserIdx !== undefined) {
        const imageBlocks = images.slice(0, 3).map((img) => ({
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
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
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

    const stream = anthropicResponse.body.pipeThrough(streamAnthropicResponse());

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
