# DEPLOY.md — TraceLens OS on NitroCloud

Repeatable deploy guide. Derived live during the first production deploy.

## Architecture notes
- Framework: NitroStack v3.0 (`@nitrostack/core`). Entry point: `src/index.ts` → `dist/index.js`.
- Transport: HTTP Streamable (`/mcp`) + legacy SSE (`/sse`) + STDIO. HTTP is only enabled when `NODE_ENV=production`.
- DB: SQLite via `better-sqlite3` at path resolved by `src/database/db-path.ts`:
  `DB_PATH` > `DATA_DIR/tracelens.db` > `process.cwd()/tracelens.db`.
- **Persistence risk:** NitroCloud is scale-to-zero serverless. Local-disk SQLite does NOT
  survive restarts. Set `DATA_DIR` (or `DB_PATH`) to a NitroCloud persistent volume mount so
  the DB and audit log persist. Otherwise data/audit log are ephemeral.

## Step 1 — Local pre-flight (must pass before push)
```bash
npm run build            # must emit dist/index.js, no TS errors
nitrostack-cli build     # alt; same
# run prod server
$env:NODE_ENV="production"; $env:PORT="3000"; node dist/index.js
# verify
curl/Invoke-WebRequest POST http://localhost:3000/mcp  initialize -> tools/list -> tools/call
```

## Step 2 — Push to GitHub
```bash
git push origin dev       # or main, depending on what NitroCloud connects
```
No `nitrostack deploy` CLI command exists in v3.0 — use the Git/dashboard path.

## Step 3 — NitroCloud dashboard (cloud.nitrostack.ai)
1. Sign up / log in at `https://cloud.nitrostack.ai/auth/login` (early-access form if gated:
   `https://cloud.nitrostack.ai/early-access`).
2. **New Project → Connect GitHub** — authorize the NitroStack GitHub app for `Anirudh05bit`.
3. **Repository** = `Anirudh05bit/LimeSoda`, **Branch** = `dev`.
4. Confirm build = `npm install` + `npm run build` (auto-detected, no Dockerfile).
   Start command: `npm start` (= `node dist/index.js`).
5. **Environment Variables** (see block below).
6. **Deploy** → auto containerize + Knative rollout (<20s) → gives a `*.nitrocloud.ai` URL.

## Step 4 — Environment variables (paste into dashboard)
```
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
# Point at NitroCloud persistent volume when available:
# DATA_DIR=/data
# DB_PATH=/data/tracelens.db
# Optional (only if OAuth/JWT auth enabled later):
# OAUTH_REQUIRED=false
# JWT_SECRET=<strong-unique-secret>
```
No API keys / DB credentials / JWT secret are required for the app to boot today.

## Step 5 — Post-deploy: seed the database (run once per fresh DB)
NitroCloud auto-runs `npm run build` but NOT the seed. After first deploy (and after any
DB wipe), run the seed against the live environment:
```bash
# locally, against the same DATA_DIR if you have shell access, OR
npm run setup-db        # runs src/database/tracelens-seed.ts
# verify seeded mule scenario is queryable:
#   tools/call expand_entity_graph { customerId: "CUST-001" } -> 4 accounts, A->B->C->A cycle
```
If NitroCloud provides no shell, run `setup-db` in a build step or one-off job that shares
the persistent volume.

## Step 6 — Verify live
```bash
# health / tools list
POST https://<your>.nitrocloud.ai/mcp
{ "jsonrpc":"2.0","id":1,"method":"initialize",
  "params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"v","version":"1"}} }
# copy Mcp-Session-Id from response header, then:
POST .../mcp  header Mcp-Session-Id: <id>
{ "jsonrpc":"2.0","id":2,"method":"tools/list" }
# real tool end-to-end:
{ "jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"expand_entity_graph","arguments":{"customerId":"CUST-001"}} }
```

## Known issues / follow-ups (from audit, not yet fixed)
- draft_sar error path throws instead of returning the DRAFT_PENDING_REVIEW schema object.
- audit-log middleware swallows DB write failures (audit gaps possible on write error).
- cycle detection: shared `visited` set across DFS loop can miss cycles in disconnected subgraphs.
- score_alert: null txn amount -> NaN score.
- generated-types (`nitrostack-cli generate types`) diverge from committed `tool-data.ts`.
