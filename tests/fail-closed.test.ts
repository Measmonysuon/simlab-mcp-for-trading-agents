import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SimLabExecutionGuard,
  FailClosedExecutionError,
  PreTradeVetoBlockedError,
  InvalidOrderIntentError,
} from '../packages/execution-guard/src/index.ts';
import type {
  OrderIntent,
  RiskVerdict,
  SimLabClientAdapter,
  ExchangeAdapter,
} from '../packages/execution-guard/src/index.ts';

describe('SimLabExecutionGuard — Fail-Closed & Veto Enforcement Tests', () => {

  const validIntent: OrderIntent = {
    symbol: 'SOL/USD',
    side: 'LONG',
    orderType: 'POST_ONLY',
    sizeUsd: 1000,
    leverage: 5,
  };

  test('PASS: Clears valid ALLOW verdict and submits order to exchange', async () => {
    let exchangeCalled = false;

    const mockSimLab: SimLabClientAdapter = {
      async preTradeCheck(intent: OrderIntent): Promise<RiskVerdict> {
        return {
          decision: 'ALLOW',
          symbol: intent.symbol,
          side: intent.side,
          timestamp: Date.now(),
          feedAgeSeconds: 2.1,
          reasonCode: 'CLEARED_ALL_SHIELDS',
          rationale: 'Microstructure absorption confirmed, low VPIN, no macro lockout.',
          confidenceScore: 92,
        };
      },
    };

    const mockExchange: ExchangeAdapter = {
      async submitOrder(intent: OrderIntent) {
        exchangeCalled = true;
        return { success: true, orderId: 'ord_12345', status: 'FILLED' };
      },
    };

    const guard = new SimLabExecutionGuard(mockSimLab, mockExchange);
    const result = await guard.executeProtectedOrder(validIntent);

    assert.equal(exchangeCalled, true, 'Exchange submitOrder should have been executed');
    assert.equal(result.orderId, 'ord_12345');
    assert.equal(result.verdict.decision, 'ALLOW');
  });

  test('BLOCK: VETO verdict halts execution; exchange submitOrder is NEVER called', async () => {
    let exchangeCalled = false;

    const mockSimLab: SimLabClientAdapter = {
      async preTradeCheck(intent: OrderIntent): Promise<RiskVerdict> {
        return {
          decision: 'VETO',
          symbol: intent.symbol,
          side: intent.side,
          timestamp: Date.now(),
          feedAgeSeconds: 1.5,
          reasonCode: 'VPIN_TOXIC_SPIKE',
          rationale: 'Volume toxicity exceeds 0.35 threshold. Institutional dump in progress.',
          confidenceScore: 24,
        };
      },
    };

    const mockExchange: ExchangeAdapter = {
      async submitOrder() {
        exchangeCalled = true;
        return { success: true, orderId: 'ord_should_not_exist', status: 'FILLED' };
      },
    };

    const guard = new SimLabExecutionGuard(mockSimLab, mockExchange);

    await assert.rejects(
      async () => {
        await guard.executeProtectedOrder(validIntent);
      },
      (err: any) => {
        assert.ok(err instanceof PreTradeVetoBlockedError);
        assert.equal(err.reasonCode, 'VPIN_TOXIC_SPIKE');
        return true;
      }
    );

    assert.equal(exchangeCalled, false, 'Exchange MUST NOT be called when VETO is returned');
  });

  test('FAIL-CLOSED: Network / 500 error from Sim Lab halts order submission', async () => {
    let exchangeCalled = false;

    const mockSimLab: SimLabClientAdapter = {
      async preTradeCheck(): Promise<RiskVerdict> {
        throw new Error('HTTP 502 Bad Gateway: Upstream server unavailable');
      },
    };

    const mockExchange: ExchangeAdapter = {
      async submitOrder() {
        exchangeCalled = true;
        return { success: true, orderId: 'ord_should_not_exist', status: 'FILLED' };
      },
    };

    const guard = new SimLabExecutionGuard(mockSimLab, mockExchange, { strictFailClosed: true });

    await assert.rejects(
      async () => {
        await guard.executeProtectedOrder(validIntent);
      },
      (err: any) => {
        assert.ok(err instanceof FailClosedExecutionError);
        assert.equal(err.reason, 'NETWORK_ERROR');
        return true;
      }
    );

    assert.equal(exchangeCalled, false, 'Exchange MUST NOT be called when risk gate throws an error');
  });

  test('FAIL-CLOSED: Latency timeout (>2000ms) blocks order dispatch', async () => {
    let exchangeCalled = false;

    const mockSimLab: SimLabClientAdapter = {
      async preTradeCheck(intent: OrderIntent): Promise<RiskVerdict> {
        // Simulate 100ms artificial delay while maxLatencyMs is set to 50ms
        await new Promise((r) => setTimeout(r, 80));
        return {
          decision: 'ALLOW',
          symbol: intent.symbol,
          side: intent.side,
          timestamp: Date.now(),
          feedAgeSeconds: 1.0,
          reasonCode: 'CLEARED',
          rationale: 'OK',
          confidenceScore: 85,
        };
      },
    };

    const mockExchange: ExchangeAdapter = {
      async submitOrder() {
        exchangeCalled = true;
        return { success: true, orderId: 'ord_timeout', status: 'FILLED' };
      },
    };

    const guard = new SimLabExecutionGuard(mockSimLab, mockExchange, { maxLatencyMs: 40 });

    await assert.rejects(
      async () => {
        await guard.executeProtectedOrder(validIntent);
      },
      (err: any) => {
        assert.ok(err instanceof FailClosedExecutionError);
        assert.equal(err.reason, 'TIMEOUT');
        return true;
      }
    );

    assert.equal(exchangeCalled, false, 'Exchange MUST NOT be called if response took longer than max latency');
  });

  test('FAIL-CLOSED: Stale market data feed (>15s) blocks order dispatch', async () => {
    let exchangeCalled = false;

    const mockSimLab: SimLabClientAdapter = {
      async preTradeCheck(intent: OrderIntent): Promise<RiskVerdict> {
        return {
          decision: 'ALLOW',
          symbol: intent.symbol,
          side: intent.side,
          timestamp: Date.now() - 30_000,
          feedAgeSeconds: 28.5, // 28.5 seconds old quote!
          reasonCode: 'CLEARED',
          rationale: 'OK',
          confidenceScore: 80,
        };
      },
    };

    const mockExchange: ExchangeAdapter = {
      async submitOrder() {
        exchangeCalled = true;
        return { success: true, orderId: 'ord_stale', status: 'FILLED' };
      },
    };

    const guard = new SimLabExecutionGuard(mockSimLab, mockExchange, { maxFeedAgeSeconds: 15 });

    await assert.rejects(
      async () => {
        await guard.executeProtectedOrder(validIntent);
      },
      (err: any) => {
        assert.ok(err instanceof FailClosedExecutionError);
        assert.equal(err.reason, 'STALE_DATA');
        return true;
      }
    );

    assert.equal(exchangeCalled, false, 'Exchange MUST NOT be called on stale quotes');
  });

  test('LOCAL VALIDATION: Rejects malformed intents before touching network', () => {
    const guard = new SimLabExecutionGuard(
      { preTradeCheck: async () => ({} as any) },
      { submitOrder: async () => ({} as any) }
    );

    assert.throws(() => {
      guard.validateIntent({ ...validIntent, symbol: 'INVALID' });
    }, InvalidOrderIntentError);

    assert.throws(() => {
      guard.validateIntent({ ...validIntent, sizeUsd: -500 });
    }, InvalidOrderIntentError);

    assert.throws(() => {
      guard.validateIntent({ ...validIntent, leverage: 150 });
    }, InvalidOrderIntentError);
  });
});
