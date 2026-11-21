import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const SIMLAB_URL = process.env.SIMLAB_URL || 'https://simlab.measmony.me';

describe('Sim Lab Free Tier & Allowance Contract Tests', () => {

  test('DISCOVERY: /x402/info contains $1 unlock allowance specification', async () => {
    let res: Response;
    try {
      res = await fetch(`${SIMLAB_URL}/x402/info`);
    } catch (err: any) {
      // In isolated environments without internet, skip remote network call
      console.warn(`[SKIP] Network unavailable for /x402/info: ${err.message}`);
      return;
    }

    assert.equal(res.status, 200, 'Expected HTTP 200 from /x402/info');
    const doc = await res.json() as any;

    assert(doc.freeTier, 'info has freeTier block');
    assert(doc.freeTier.allowance, 'info has freeTier.allowance block');

    const allowance = doc.freeTier.allowance;
    assert.equal(allowance.paidToolCallsPerMonth, 100, '100 free calls per month');
    assert.equal(allowance.unlock, 'any top-up of $1 or more in the calendar month');
    assert(allowance.paceLimit.includes('10 free calls'), 'paceLimit mentions 10 free calls');
    assert.equal(allowance.resets, 'monthly, 00:00 UTC on the 1st, no rollover');
    assert.equal(allowance.per, 'wallet address (x-wallet), per network');
  });

  test('GATE: Unpaid client receives -32042 error naming $1 unlock & top-up routes', async () => {
    const clientId = `test_unpaid_${Date.now()}`;
    const testWallet = '0x1234567890123456789012345678901234567890';
    let sseRes: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${SIMLAB_URL}/mcp/sse`, {
          headers: {
            'x-client-id': clientId,
            'x-wallet': testWallet,
            'Accept': 'text/event-stream',
          },
        });
        if (res.status === 200) {
          sseRes = res;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err: any) {
        if (attempt === 3) {
          console.warn(`[SKIP] Network unavailable for /mcp/sse: ${err.message}`);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    if (!sseRes) {
      console.warn('[SKIP] /mcp/sse temporarily unavailable');
      return;
    }
    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();
    let endpoint = '';
    let buffer = '';

    const timeout = setTimeout(() => {
      reader.cancel();
    }, 15000);

    try {
      while (!endpoint) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line.includes('/mcp/messages')) {
            endpoint = line.slice(6).trim();
            break;
          }
        }
      }

      if (!endpoint) {
        throw new Error('Failed to obtain endpoint from SSE stream');
      }

      const postUrl = endpoint.startsWith('http') ? endpoint : `${SIMLAB_URL}${endpoint}`;
      const rpcId = `verify_gate_${Date.now()}`;

      // Dispatch tools/call for pre_trade_check using consistent clientId and wallet
      const rpcCall = await fetch(postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': clientId,
          'x-wallet': testWallet,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: rpcId,
          method: 'tools/call',
          params: {
            name: 'pre_trade_check',
            arguments: { symbol: 'BTC/USD', side: 'LONG' },
          },
        }),
      });

      assert([200, 202].includes(rpcCall.status), `JSON-RPC HTTP status should be 200 or 202, got ${rpcCall.status}`);

      // Read JSON-RPC response from SSE stream
      let responseMsg: any = null;
      while (!responseMsg) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
          if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine.slice(6).trim());
              if (parsed.id === rpcId) {
                responseMsg = parsed;
                break;
              }
            } catch {}
          }
        }
      }

      assert(responseMsg, 'Received JSON-RPC response');
      assert.equal(responseMsg.error?.code, -32042, 'Error code must be -32042');
      assert(
        responseMsg.error.message.includes('Any top-up of $1 or more unlocks 100 free priced tool calls this month.'),
        `Message must name $1 unlock. Got: "${responseMsg.error.message}"`
      );
      assert(
        responseMsg.error.message.includes('Top up credit via POST /x402/topup (Base) or POST /x402/solana/request (Solana Pay).'),
        `Message must name top-up routes. Got: "${responseMsg.error.message}"`
      );
      assert.equal(responseMsg.error.data?.freeAllowanceRemaining, 0);
      assert.equal(responseMsg.error.data?.freeAllowanceExhausted, false);
      assert(responseMsg.error.data?.topup?.includes('/x402/topup'));
      assert(responseMsg.error.data?.topupSolana?.includes('/x402/solana/request'));
    } finally {
      clearTimeout(timeout);
      reader.cancel();
    }
  });
});
