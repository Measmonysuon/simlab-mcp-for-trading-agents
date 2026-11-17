# @simlab/glama-bridge

Thin stdio-to-SSE bridge for the Sim Lab MCP server — the piece Glama needs
to build, inspect and deploy the listing.

## Why this exists

The Sim Lab MCP server is a **remote service** (`https://simlab.measmony.me/mcp/sse`).
Glama releases are built from a Dockerfile and inspected over **stdio**, so a
remote-only repo can never get a release, a Coherence score, a Tool
Definition Quality score, or a Deploy button. This bridge closes that gap
without moving any server code into the repo: it is a small proxy, not a
reimplementation.

## How it works

1. On startup the bridge connects to the remote SSE endpoint and lists its tools.
2. It exposes exactly those tools — same names, descriptions and input
   schemas — over stdio, and forwards every call to the remote server.
3. It never invents a tool, a price, a verdict or a receipt. If the remote
   is unreachable it retries briefly, then exits non-zero (fail-closed)
   instead of serving an empty or hollow tool list.

## Configuration

All settings come from the environment. Nothing secret is ever logged.

| Variable | Required | What it is |
|---|---|---|
| `SIMLAB_MCP_URL` | No | Remote endpoint. Default `https://simlab.measmony.me/mcp/sse`. |
| `X_CLIENT_ID` | No | Stable agent id. Defaults to `glama-bridge`, so the free regime headline works with no configuration. Also accepts `x-client-id` / `SIMLAB_CLIENT_ID`. |
| `X_WALLET` | No | Base wallet address, binds x402 top-up credit to the client id. Also `x-wallet` / `SIMLAB_WALLET`. |
| `X_SPEND_KEY` | No | Spend key issued on x402 top-up settlement. Also `x-spend-key` / `SIMLAB_SPEND_KEY`. |
| `AUTHORIZATION` | No | Licence key (`Bearer <key>` or the bare key). Licence holders bypass per-call charging. Also `Authorization` / `SIMLAB_LICENSE_KEY` / `SIMLAB_API_KEY`. |

## Run it

```sh
cd packages/glama-bridge
npm ci --omit=dev
node bridge.mjs
```

Smoke test (no credentials — free tier only, needs network):

```sh
npm test
```

## Glama setup

1. Push this package plus the repo-root `Dockerfile` to `main`.
2. In Glama Admin → Repository, **Sync Server**.
3. In Glama Admin → Build (Dockerfile), confirm the Dockerfile path is
   `Dockerfile` and the four environment variables are declared:
   `x-client-id`, `x-wallet`, `x-spend-key`, `Authorization`.
   Values are entered by whoever deploys — never commit a real key, wallet
   or spend key to the repo.
4. **Make Release.** Glama builds the image, inspects the tools over
   stdio, and enables Deploy. That unlocks the Server Coherence and Tool
   Definition Quality checks.
