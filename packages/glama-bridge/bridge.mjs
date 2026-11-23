#!/usr/bin/env node
/**
 * simlab-glama-bridge — thin stdio-to-SSE proxy for the Sim Lab MCP server.
 *
 * The Sim Lab MCP server itself is a REMOTE service:
 *   https://simlab.measmony.me/mcp/sse
 * Glama can only build, inspect and deploy a listing from a container that
 * speaks MCP over stdio, so this bridge is the missing piece:
 *
 *   MCP client (stdio, this process)  <->  Sim Lab (SSE, remote)
 *
 * Behaviour:
 *  - The stdio server starts immediately, so `initialize` answers even if
 *    the remote is slow; the remote connection happens in the background
 *    and tools/list / tools/call wait for it.
 *  - It exposes exactly the remote's tools — same names, descriptions and
 *    input schemas — over stdio, and forwards every call to the remote.
 *  - It never invents a tool, a price, a verdict or a receipt. If the
 *    remote stays unreachable, tools/list and tools/call fail honestly
 *    with an MCP error instead of serving an empty or hollow tool list.
 *  - It never logs a credential. Headers are read from the environment and
 *    never printed.
 *
 * Environment (all optional except where noted):
 *   SIMLAB_MCP_URL   Remote MCP endpoint (default https://simlab.measmony.me/mcp/sse)
 *   X_CLIENT_ID      Stable agent id. Also accepts `x-client-id` / SIMLAB_CLIENT_ID.
 *                    Defaults to "glama-bridge" so the free headline works
 *                    with no configuration at all.
 *   X_WALLET         Base (EVM) wallet address. Also `x-wallet` / SIMLAB_WALLET.
 *                    Needed to bind x402 top-up credit to this client id.
 *   X_SPEND_KEY      Spend key issued on x402 top-up settlement.
 *                    Also `x-spend-key` / SIMLAB_SPEND_KEY.
 *   AUTHORIZATION    Licence key as `Bearer <key>` (or the bare key; the
 *                    Bearer prefix is added). Also `Authorization` /
 *                    SIMLAB_LICENSE_KEY / SIMLAB_API_KEY. Licence holders
 *                    bypass per-call charging.
 *
 * Run:  node bridge.mjs
 * Test: npm test   (spawns the bridge over stdio and calls the free regime headline)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

const NAME = 'simlab-glama-bridge';
const VERSION = '1.3.1';
const DEFAULT_URL = 'https://simlab.measmony.me/mcp/sse';

// stdout is the MCP channel — everything human-readable goes to stderr.
const log = (...args) => console.error(`[${NAME}]`, ...args);

function envFirst(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

function buildHeaders() {
  const headers = {};
  // A client id is required to bind credit; default keeps the free headline
  // working with zero configuration. It is a public identifier, not a secret.
  headers['x-client-id'] =
    envFirst('X_CLIENT_ID', 'x-client-id', 'SIMLAB_CLIENT_ID') ?? 'glama-bridge';

  const wallet = envFirst('X_WALLET', 'x-wallet', 'SIMLAB_WALLET');
  if (wallet) headers['x-wallet'] = wallet;

  const spendKey = envFirst('X_SPEND_KEY', 'x-spend-key', 'SIMLAB_SPEND_KEY');
  if (spendKey) headers['x-spend-key'] = spendKey;

  const licence = envFirst(
    'AUTHORIZATION',
    'Authorization',
    'SIMLAB_LICENSE_KEY',
    'SIMLAB_API_KEY',
  );
  if (licence) {
    headers.Authorization = licence.startsWith('Bearer ')
      ? licence
      : `Bearer ${licence}`;
  }
  return headers;
}

async function connectRemote(url, headers, attempts = 5) {
  let delayMs = 1000;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const client = new Client(
        { name: NAME, version: VERSION },
        { capabilities: {} },
      );
      const transport = new SSEClientTransport(new URL(url), {
        requestInit: { headers },
      });
      await client.connect(transport);
      return client;
    } catch (error) {
      log(`remote connect attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const url = envFirst('SIMLAB_MCP_URL') ?? DEFAULT_URL;
  const headers = buildHeaders();

  // Connect to the remote in the background. The stdio server starts FIRST
  // so `initialize` always answers promptly even if the remote is slow;
  // tools/list and tools/call wait for the remote (and fail honestly if it
  // never comes up) instead of timing out the inspector.
  log(`connecting to ${url} ...`);
  let remoteTools = null;
  const remoteReady = (async () => {
    const remote = await connectRemote(url, headers);
    const { tools } = await remote.listTools();
    remoteTools = tools;
    log(
      `connected — ${tools.length} remote tools: ${tools.map((t) => t.name).join(', ')}`,
    );
    return remote;
  })().catch((error) => {
    log(`remote unreachable after retries: ${error.message}`);
    throw error;
  });

  const server = new Server(
    { name: NAME, version: VERSION },
    { capabilities: { tools: {} } },
  );

  const requireRemote = async () => {
    try {
      return await remoteReady;
    } catch {
      throw new McpError(
        ErrorCode.InternalError,
        'Sim Lab remote MCP server is unreachable — no tools can be served',
      );
    }
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    await requireRemote();
    return {
      tools: remoteTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const remote = await requireRemote();
    const { name, arguments: args } = request.params;
    if (!remoteTools.some((tool) => tool.name === name)) {
      throw new McpError(ErrorCode.MethodNotFound, `unknown tool: ${name}`);
    }
    const result = await remote.callTool({ name, arguments: args ?? {} });
    return {
      content: result.content ?? [],
      ...(result.structuredContent !== undefined
        ? { structuredContent: result.structuredContent }
        : {}),
      ...(result.isError !== undefined ? { isError: result.isError } : {}),
    };
  });

  const shutdown = async () => {
    try {
      const remote = await remoteReady;
      await remote.close();
    } catch {
      // already gone — nothing to do
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.connect(new StdioServerTransport());
  log('stdio bridge ready');
}

main().catch((error) => {
  log(`FATAL: ${error.message}`);
  process.exit(1);
});
