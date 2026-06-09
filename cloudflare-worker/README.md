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

## Notes

- **Allowed origins**: the worker only accepts requests from
  `https://avivnofar.github.io`, `http://localhost:3000`, and
  `http://127.0.0.1:5500`. Add your own origin to `ALLOWED_ORIGINS` in
  `worker.js` if you deploy elsewhere.
- **Rate limiting**: 20 requests/minute per IP, enforced in-memory.
- **Cost**: Cloudflare Workers free tier includes 100,000 requests/day —
  this is $0/month at personal-use volume. See `CLAUDE.md` →
  "Infrastructure Costs" for details.
