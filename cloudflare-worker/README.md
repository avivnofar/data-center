# Cloudflare Worker — Deployment Guide

This worker is a secure proxy between the Data Center frontend and the
Anthropic API. It is the **only** place the Anthropic API key exists — the
static site never sees it.

## Deployment steps

1. **Create a Cloudflare account** at [cloudflare.com](https://cloudflare.com) (free).

2. Go to **Workers & Pages → Create → Create Worker**, and name it
   `data-center-api`.

3. Open the worker editor, delete the default contents, and paste in the
   contents of [`worker.js`](./worker.js). Click **Deploy**.

4. Go to the worker's **Settings → Variables**, and add an
   **encrypted secret**:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key

5. Note your worker URL — it will look like:
   ```
   https://data-center-api.<your-subdomain>.workers.dev
   ```

6. In `index.html`, update `CONFIG.WORKER_URL` with your worker URL:
   ```javascript
   const CONFIG = {
     WORKER_URL: 'https://data-center-api.<your-subdomain>.workers.dev',
     AI_ENABLED: true,
     ...
   };
   ```

   Then commit and push:
   ```bash
   git add index.html
   git commit -m "config: set Cloudflare Worker URL"
   git push
   ```

## Turnstile — two-step enablement (optional, currently dormant)

`verifyTurnstile()` in `worker.js` is complete and wired in, but **dormant
until the `TURNSTILE_SECRET` secret exists**. It returns `null` immediately
when the secret is unset, so deploying `worker.js` alone can never break the
live app. The two steps, in this order:

1. **Frontend first.** `index.html` must already be sending a `turnstile_token`
   in the `sendAiMessage()` request body before the secret is set. Tokens are
   single-use and expire after ~300s, so this needs an execute-per-request
   (invisible/pre-clearance) widget, not a solve-once-at-page-load widget.
2. **Then the secret**: `wrangler secret put TURNSTILE_SECRET`. This is the
   switch, and it is instant and global.

> ⚠️ **It fails closed.** The moment the secret exists, every request without a
> valid token gets `403 {error:'auth'}`. Setting the secret before step 1 takes
> the AI features down for everyone.

> ⚠️ **List every origin on the widget**, not just `avivnofar.github.io`.
> `http://localhost:3000` and `http://127.0.0.1:5500` must be on the Cloudflare
> Turnstile widget's domain list too, or local development breaks as soon as the
> secret is set — the check fails closed for every origin equally.

Full scoping (including the client-side error state and the zero-dependency
implication of the external `challenges.cloudflare.com` script tag) is in
`automation/NEEDS_YOUR_REVIEW.md` → F-02.

## Notes

- **Allowed origins**: the worker only accepts requests from
  `https://avivnofar.github.io`, `http://localhost:3000`, and
  `http://127.0.0.1:5500`. Add your own origin to `ALLOWED_ORIGINS` in
  `worker.js` if you deploy elsewhere.
- **Rate limiting**: 20 requests/minute per IP, enforced in-memory.
- **Daily cap**: `DAILY_MAX_PER_ISOLATE = 300` accepted requests per UTC day.
  Both this and the rate limiter are **per-isolate** in-memory counters, not
  global ceilings — Cloudflare runs many isolates and each keeps its own. A real
  global limit needs a Durable Object or KV with TTL. See SEC-02 in
  `automation/NEEDS_YOUR_REVIEW.md`.
- **Cost**: Cloudflare Workers free tier includes 100,000 requests/day —
  this is $0/month at personal-use volume. See `CLAUDE.md` →
  "Infrastructure Costs" for details.
