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
 * against Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`) so the
 * simulation can continue rather than halting. See
 * agents/config/token-economy.json for the fallback's daily limit/reset.
 *
 * Status: DRAFT (Phase 1 foundation).
 */

const CF_FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct';

/**
 * @param {object} opts
 * @param {string} opts.apiKey - GEMINI_API_KEY (Worker secret)
 * @param {string} opts.model - e.g. "gemini-2.5-flash-lite"
 * @param {string} opts.endpoint - base endpoint, e.g. simulation-config.json GEMINI.api_endpoint
 * @param {string} opts.prompt - the user-turn prompt
 * @param {string} [opts.systemPrompt] - system instruction (agent personality + state)
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.cfAccountId] - CLOUDFLARE_ACCOUNT_ID (Worker secret), for 429 fallback
 * @param {string} [opts.cfApiToken] - CLOUDFLARE_API_TOKEN (Worker secret), for 429 fallback
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
  cfAccountId,
  cfApiToken,
}) {
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
    return queryCloudflareFallback({
      accountId: cfAccountId,
      apiToken: cfApiToken,
      prompt,
      systemPrompt,
      temperature,
      maxTokens,
    });
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
 * exhausted). See agents/config/token-economy.json "cloudflare_fallback".
 */
async function queryCloudflareFallback({ accountId, apiToken, prompt, systemPrompt, temperature, maxTokens }) {
  if (!accountId || !apiToken) {
    throw new Error(
      'Gemini quota exceeded (429) and Cloudflare Workers AI fallback is not ' +
      'configured (missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN)'
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_FALLBACK_MODEL}`;

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Cloudflare Workers AI fallback error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = (data?.result?.response || '').trim();
  return { text, source: 'cloudflare-fallback' };
}
