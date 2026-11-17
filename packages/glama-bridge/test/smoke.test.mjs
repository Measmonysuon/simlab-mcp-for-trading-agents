/**
 * Smoke test for the glama bridge.
 *
 * Spawns `node bridge.mjs` over stdio (no credentials — the free tier only),
 * runs initialize -> tools/list -> tools/call get_market_regime, and asserts
 * the proxy forwards the real remote tools and the free headline.
 *
 * Requires network access to https://simlab.measmony.me/mcp/sse.
 * Run: npm test   (from packages/glama-bridge)
 */
import { spawn } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BRIDGE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'bridge.mjs',
);

function startBridge() {
  const child = spawn(process.execPath, [BRIDGE], {
    env: { ...process.env, X_CLIENT_ID: 'glama-bridge-smoke-test' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buffer = '';
  const pending = new Map();
  let nextId = 1;
  const lines = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      lines.push(line);
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', () => {}); // bridge logs go to stderr; ignore here

  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`timeout waiting for ${method}`));
        }
      }, 60000);
    });
  const notify = (method, params = {}) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  };
  return { child, request, notify, lines };
}

test('bridge lists the remote tools and serves the free regime headline', async () => {
  const { child, request, notify } = startBridge();
  try {
    const init = await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'glama-bridge-smoke-test', version: '1.0.0' },
    });
    assert.equal(init.serverInfo.name, 'simlab-glama-bridge');
    notify('notifications/initialized');

    const { tools } = await request('tools/list');
    assert.ok(Array.isArray(tools), 'tools/list must return an array');
    assert.ok(
      tools.length >= 10,
      `expected at least 10 tools, got ${tools.length}`,
    );
    const names = tools.map((t) => t.name);
    assert.ok(names.includes('get_market_regime'), 'get_market_regime must be listed');
    assert.ok(names.includes('get_golden_entry'), 'get_golden_entry must be listed');
    assert.ok(
      names.includes('evaluate_dynamic_exit'),
      'evaluate_dynamic_exit must be listed',
    );

    const result = await request('tools/call', {
      name: 'get_market_regime',
      arguments: {},
    });
    assert.equal(result.isError, undefined, 'free regime call must not error');
    const text = JSON.stringify(result.content);
    assert.match(text, /FREE_COARSE|headlineRegime/, 'free headline must come back');
  } finally {
    child.kill('SIGTERM');
  }
});
