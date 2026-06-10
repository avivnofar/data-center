# Deploying `agent-runner.js` to Cloudflare

Quick-reference companion to [`README.md`](./README.md)'s full "Setup" section.
Read that first if you haven't provisioned D1 / Durable Objects / KV / secrets yet —
`agent-runner.js` won't function without those bindings regardless of how the
code gets onto Cloudflare.

## Why this isn't a simple "paste and deploy"

`agent-runner.js` is an ES module with relative imports across this folder:

```
agent-runner.js
├── ../config/agents-config.json
├── ../config/simulation-config.json
├── ../agents/agent-1-perfectionist.js
├── ../agents/agent-2-productive.js
├── ../agents/agent-3-standard.js
├── ../agents/agent-4-trainee.js
├── ../agents/agent-stub.js
└── ../agents/agent-base.js (imported by the above)
    └── ./gemini-client.js
```

Cloudflare's dashboard **Quick Edit** only accepts a single file, so pasting
just `agent-runner.js` into it will fail with module-resolution errors. Use
one of the two options below.

## Option A — Wrangler CLI (recommended)

1. Complete `README.md` Setup steps 1-6 (Gemini key, D1, Durable Objects, KV,
   cron triggers, `ADMIN_TOKEN`) and write a `wrangler.toml` in
   `agents/workers/` binding `DB`, `AGENT_STATE`, and `SIM_KV`.
2. From `agents/workers/`:
   ```bash
   npx wrangler deploy agent-runner.js --name data-center-agents
   ```
3. Repeat for the scheduler:
   ```bash
   npx wrangler deploy scheduler.js --name data-center-scheduler
   ```

## Option B — Dashboard multi-file editor

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages
   → Create → Create Worker**, name it `data-center-agents`.
2. Open the editor. Use **+ New file** to recreate the folder structure above
   (same relative paths), pasting each file's contents from this repo.
3. Set `agent-runner.js` as the entry point (Settings → Build → Entry point).
4. Under **Settings → Bindings**, add the `DB` (D1), `AGENT_STATE` (Durable
   Object), and `SIM_KV` (KV) bindings from `README.md` step 2-4.
5. Under **Settings → Variables**, add encrypted secrets `GEMINI_API_KEY` and
   `ADMIN_TOKEN`.
6. Click **Deploy**.

## Verify it's working

```bash
curl -s https://data-center-agents.avivnofar.workers.dev/api/agents/status \
  -H "X-Admin-Token: <your ADMIN_TOKEN>"
```

Expected: a JSON array with one object per agent (id 1-11), each with `mood`,
`irritation`, `status`, etc. A `401 {"error":"unauthorized"}` means the token
header didn't match the Worker's `ADMIN_TOKEN` secret. A `500`/connection
error usually means a binding (`DB`, `AGENT_STATE`, or `SIM_KV`) is missing.

Once `/api/agents/status` returns data, the in-app 🔐 Admin tab (and
`agents/dashboard/admin-panel.html`) will load against
`CONFIG.AGENTS_API_BASE` in `index.html`.
