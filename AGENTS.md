# Project Workflow

- Always push every update. After any change:
  1. `git add <changed files> && git commit -m "<concise message>" && git push origin main`
  2. `npx wrangler deploy` (pushes to Cloudflare Workers, https://chudjakbrutalcell.merrittjake65.workers.dev)

- Active chudportal code lives in `scramjet-proxy/index.html` and `scramjet-proxy/public/index.html`. Keep both in sync when editing.
- AI chat backend: Cloudflare Workers AI Llama model via `wrangler-worker.js`.