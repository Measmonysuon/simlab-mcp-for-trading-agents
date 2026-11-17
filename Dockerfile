# Sim Lab — Glama release image.
#
# The Sim Lab MCP server itself is a remote service
# (https://simlab.measmony.me/mcp/sse). This image only runs a thin stdio
# bridge (packages/glama-bridge) that proxies MCP over stdio to that
# endpoint, so Glama can build, inspect and deploy the listing. No server
# code lives in this repo; the bridge never invents tools, prices or verdicts.
FROM node:24-alpine

WORKDIR /app

# Install the bridge's dependencies first (layer cache).
COPY packages/glama-bridge/package.json packages/glama-bridge/package-lock.json ./packages/glama-bridge/
RUN cd packages/glama-bridge && npm ci --omit=dev

# Copy the bridge source (single file, no build step).
COPY packages/glama-bridge/bridge.mjs ./packages/glama-bridge/bridge.mjs

ENV SIMLAB_MCP_URL=https://simlab.measmony.me/mcp/sse

CMD ["node", "packages/glama-bridge/bridge.mjs"]
