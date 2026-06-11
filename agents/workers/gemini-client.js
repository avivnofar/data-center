/**
 * Data Center — AI Agent Simulation — Gemini 2.0 Flash client.
 *
 * Thin wrapper around the Google AI Studio "generateContent" REST endpoint.
 * Used by AgentBase.queryGemini() — never called directly by the frontend.
 *
 * Status: DRAFT (Phase 1 foundation).
 */

/**
 * @param {object} opts
 * @param {string} opts.apiKey - GEMINI_API_KEY (Worker secret)
 * @param {string} opts.model - e.g. "gemini-2.5-flash-lite"
 * @param {string} opts.endpoint - base endpoint, e.g. simulation-config.json GEMINI.api_endpoint
 * @param {string} opts.prompt - the user-turn prompt
 * @param {string} [opts.systemPrompt] - system instruction (agent personality + state)
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @returns {Promise<string>} the model's text response
 */
export async function queryGemini({
  apiKey,
  model,
  endpoint,
  prompt,
  systemPrompt,
  temperature = 0.8,
  maxTokens = 1024,
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

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}
