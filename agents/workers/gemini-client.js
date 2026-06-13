/**
 * Data Center — AI Agent Simulation — Gemini 2.5 Flash-Lite client with
 * Cloudflare Workers AI fallback.
 *
 * Thin wrapper around the Google AI Studio "generateContent" REST endpoint.
 * Used by AgentBase.queryGemini() and meeting-engine.js — never called
 * directly by the frontend.
 *
 * Fallback: if Gemini responds with HTTP 429 (quota exhausted — a recurring
 * issue on the free tier, see TOKEN-BUDGET.md), the request is retried once
 * against Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct-fp8`) via the
 * Worker's native `AI` binding (`wrangler.toml` `[ai] binding = "AI"`) so the
 * simulation can continue rather than halting. No extra credentials needed —
 * the binding is account-scoped like D1/KV. See
 * agents/config/token-economy.json for the fallback's daily limit/reset.
 *
 * Status: DRAFT (Phase 1 foundation).
 */

const CF_FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

/**
 * @param {object} opts
 * @param {string} opts.apiKey - GEMINI_API_KEY (Worker secret)
 * @param {string} opts.model - e.g. "gemini-2.5-flash-lite"
 * @param {string} opts.endpoint - base endpoint, e.g. simulation-config.json GEMINI.api_endpoint
 * @param {string} opts.prompt - the user-turn prompt
 * @param {string} [opts.systemPrompt] - system instruction (agent personality + state)
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {object} [opts.ai] - env.AI (Workers AI binding), used for the 429 fallback
 * @param {boolean} [opts.forceFallback] - skip Gemini entirely and go straight to the
 *   Cloudflare fallback (testing only — see /api/agents/test-gemini)
 * @returns {Promise<{text: string, source: 'gemini'|'cloudflare-fallback'}>}
 */
export async function queryGemini({
  apiKey,
  model,
  endpoint,
  prompt,
  systemPrompt,
  temperature = 0.8,
  maxTokens = 1024,
  ai,
  forceFallback = false,
}) {
  if (forceFallback) {
    return queryCloudflareFallback({ ai, prompt, systemPrompt, temperature, maxTokens });
  }

  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

  const url = `${endpoint}/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    return queryCloudflareFallback({ ai, prompt, systemPrompt, temperature, maxTokens });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  return { text, source: 'gemini' };
}

/**
 * Cloudflare Workers AI fallback, used when Gemini returns 429 (quota
 * exhausted) or when forceFallback is set. See
 * agents/config/token-economy.json "cloudflare_fallback".
 */
async function queryCloudflareFallback({ ai, prompt, systemPrompt, temperature, maxTokens }) {
  if (!ai) {
    throw new Error(
      'Cloudflare Workers AI fallback is not configured (missing AI binding — ' +
      'add [ai] binding = "AI" to wrangler.toml)'
    );
  }

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const data = await ai.run(CF_FALLBACK_MODEL, {
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  const text = (data?.response || '').trim();
  return { text, source: 'cloudflare-fallback' };
}
