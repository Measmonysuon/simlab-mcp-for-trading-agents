import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SimLabExecutionGuard,
  InvalidOrderIntentError,
} from '../packages/execution-guard/src/index.ts';

describe('Parameter & Schema Validation Boundary Tests', () => {
  const guard = new SimLabExecutionGuard(
    { preTradeCheck: async () => ({} as any) },
    { submitOrder: async () => ({} as any) }
  );

  test('Symbol must adhere to BASE/QUOTE pattern', () => {
    assert.throws(
      () => guard.validateIntent({ symbol: '', side: 'LONG', orderType: 'LIMIT', sizeUsd: 100, leverage: 1 }),
      InvalidOrderIntentError
    );
    assert.throws(
      () => guard.validateIntent({ symbol: 'SOLUSD', side: 'LONG', orderType: 'LIMIT', sizeUsd: 100, leverage: 1 }),
      InvalidOrderIntentError
    );
  });

  test('Side must be either LONG or SHORT', () => {
    assert.throws(
      () => guard.validateIntent({ symbol: 'BTC/USD', side: 'BUY' as any, orderType: 'LIMIT', sizeUsd: 100, leverage: 1 }),
      InvalidOrderIntentError
    );
  });

  test('Size must be positive finite number', () => {
    assert.throws(
      () => guard.validateIntent({ symbol: 'BTC/USD', side: 'LONG', orderType: 'LIMIT', sizeUsd: 0, leverage: 1 }),
      InvalidOrderIntentError
    );
    assert.throws(
      () => guard.validateIntent({ symbol: 'BTC/USD', side: 'LONG', orderType: 'LIMIT', sizeUsd: -100, leverage: 1 }),
      InvalidOrderIntentError
    );
    assert.throws(
      () => guard.validateIntent({ symbol: 'BTC/USD', side: 'LONG', orderType: 'LIMIT', sizeUsd: NaN, leverage: 1 }),
      InvalidOrderIntentError
    );
  });

  test('Leverage must be within valid institutional boundary [1, 100]', () => {
    assert.throws(
      () => guard.validateIntent({ symbol: 'BTC/USD', side: 'LONG', orderType: 'LIMIT', sizeUsd: 100, leverage: 0 }),
      InvalidOrderIntentError
    );
    assert.throws(
      () => guard.validateIntent({ symbol: 'BTC/USD', side: 'LONG', orderType: 'LIMIT', sizeUsd: 100, leverage: 101 }),
      InvalidOrderIntentError
    );
  });
});
