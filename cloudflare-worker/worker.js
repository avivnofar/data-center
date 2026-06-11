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
const MAX_TOKENS = 1024;

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
You have deep knowledge of Linux, Windows CMD, networking, and cybersecurity.
The user's local database context will be provided — reference it when relevant.
Always cite specific commands when answering. Be concise and practical.
Response language: ${langLabel}
When responding in Hebrew: use natural Israeli IT professional style —
Hebrew instructions, English technical terms (commands, flags, protocols, ports,
error messages, file paths) always in English inline.
Keep code blocks, commands, and flags in English regardless of response language.`;

  if (mode === 'diagnose') {
    prompt += `

The user wants guided diagnosis. Ask ONE targeted follow-up question at a time.
Start by understanding the symptom, then narrow down systematically.
When you have enough information, provide the step-by-step solution with exact commands.
Format diagnosis steps as numbered list. Each step must include the exact command to run.`;
  } else {
    prompt += `

The user is doing a free search. Answer their question directly and completely.
After your answer, on a new line write: RELATED_COMMANDS: [comma-separated command names]
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
