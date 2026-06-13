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

const MODEL = 'claude-sonnet-4-6';
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
 * Build the system prompt based on mode (search/diagnose), language (en/he),
 * the local DB context string injected by the frontend, and whether CLI Mode
 * is active (compact, command-first answers).
 */
function systemPrompt(mode, language, dbContext, cliMode) {
  const langLabel = language === 'he' ? 'HEBREW' : 'ENGLISH';

  let prompt = `You are an expert IT support assistant embedded in the Data Center knowledge base.
You have deep knowledge of Linux, Windows CMD/PowerShell, networking, and cybersecurity.
The user's local database context will be provided — reference it when relevant.
Always cite specific commands when answering. Be concise and practical.
This is a compact chat UI, not a document: avoid heavy markdown decoration
(multiple "##" headers, horizontal rules, emoji section markers). Prefer one
short intro line, a code block with the key command(s), and brief explanation —
leave room for the required closing section described below.
Response language: ${langLabel}
When responding in Hebrew: use natural Israeli IT professional style —
Hebrew instructions, English technical terms (commands, flags, protocols, ports,
error messages, file paths) always in English inline.
Keep code blocks, commands, and flags in English regardless of response language.

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
  iperf3, arp, tshark, ethtool, nmcli), routing (route), firewall (iptables, ufw,
  Windows Defender Firewall)
- Troubleshoot scenarios (data/troubleshoot.json): step-by-step guides for SSH
  issues, disk full, service crashes, high CPU/memory, no internet, port conflicts,
  Windows blue screen, permission denied, DNS resolution, time sync, VPN/internal
  access, web service unreachable, AD login failures, SSL certificate errors.
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

  if (dbContext && dbContext.trim()) {
    prompt += `\n\n${dbContext.trim()}`;
  }

  prompt += `

CAPABILITIES:
- A web_search tool is available. Use it when your training data may be
  outdated, or the user asks about current versions, recent CVEs, or
  something not covered by the local knowledge base. Prefer official
  documentation domains: man7.org, learn.microsoft.com, docs.microsoft.com,
  ss64.com, linux.org, kernel.org, iana.org, rfc-editor.org, nmap.org,
  wireshark.org, ubuntu.com, redhat.com, debian.org, cloudflare.com,
  cisco.com, tcpdump.org, iperf.fr, software.es.net. Treat any other
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

    const { messages, mode, language, db_context, cli_mode } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'general', message: '"messages" must be a non-empty array' }, 400, origin);
    }

    const system = systemPrompt(mode === 'diagnose' ? 'diagnose' : 'search', language === 'he' ? 'he' : 'en', db_context || '', !!cli_mode);

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
          messages,
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
