import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FreeAllowanceTracker, FREE_CALLS_PER_MONTH_AFTER_TOPUP, FREE_CALLS_PER_HOUR } from '../packages/x402-allowance/dist/index.js';

describe('FreeAllowanceTracker Unit & Invariant Tests', () => {

  test('UNLOCKED: $1 topup grants 100 calls in active calendar month', () => {
    const tracker = new FreeAllowanceTracker();
    const res = tracker.recordTopup('eip155:8453', '0x1111111111111111111111111111111111111111', 1_000_000);
    assert.equal(res.qualified, true);
    assert.equal(res.totalGranted, FREE_CALLS_PER_MONTH_AFTER_TOPUP);

    const status = tracker.checkAllowance('eip155:8453', '0x1111111111111111111111111111111111111111');
    assert.equal(status.qualified, true);
    assert.equal(status.remaining, 100);
  });

  test('CONSUME: Calls deduct 1 from remaining and log execution', () => {
    const tracker = new FreeAllowanceTracker();
    tracker.recordTopup('eip155:8453', '0x2222222222222222222222222222222222222222', 1_000_000);

    const call1 = tracker.consumeAllowance('eip155:8453', '0x2222222222222222222222222222222222222222', 'agent-a', 'pre_trade_check');
    assert.equal(call1.freeAllowance, true);
    assert.equal(call1.remaining, 99);

    const status = tracker.checkAllowance('eip155:8453', '0x2222222222222222222222222222222222222222');
    assert.equal(status.remaining, 99);
  });

  test('PACE LIMIT: 11th call in an hour is flagged and throttled', () => {
    const tracker = new FreeAllowanceTracker();
    tracker.recordTopup('eip155:8453', '0x3333333333333333333333333333333333333333', 1_000_000);

    for (let i = 0; i < FREE_CALLS_PER_HOUR; i++) {
      tracker.consumeAllowance('eip155:8453', '0x3333333333333333333333333333333333333333', 'agent-pace', 'pre_trade_check');
    }

    const paceCheck = tracker.checkAllowance('eip155:8453', '0x3333333333333333333333333333333333333333');
    assert.equal(paceCheck.hourlyAllowed, false, '11th call must be blocked by pace limiter');
    assert(paceCheck.retryAfterSeconds > 0, 'Must provide retryAfterSeconds');
    assert.equal(paceCheck.remaining, 90, 'Allowance remains 90 (not consumed on pace limit)');
  });

  test('EXISTING CREDIT: Wallets with existing topup in current month auto-qualify', () => {
    const tracker = new FreeAllowanceTracker();
    // Wallet has $5 top-up in current month, but no prior allowance entry
    const status = tracker.checkAllowance(
      'eip155:8453',
      '0x4444444444444444444444444444444444444444',
      Date.now(),
      0, // balance
      5_000_000 // existing $5 top-up
    );

    assert.equal(status.qualified, true, 'Existing paid wallet must auto-qualify');
    assert.equal(status.remaining, 100);
  });

  test('MONTHLY RESET: Wallet with balance >= $1 auto-renews 100 free calls in new month; balance < $1 requires top-up', () => {
    const tracker = new FreeAllowanceTracker();
    const futureMonthMs = Date.now() + 35 * 86400 * 1000;

    // 1. Wallet with balance $2.50 auto-renews 100 free calls in new month
    const renewed = tracker.checkAllowance(
      'eip155:8453',
      '0x5555555555555555555555555555555555555555',
      futureMonthMs,
      2_500_000, // balance >= $1
      0
    );
    assert.equal(renewed.qualified, true, 'Balance >= $1 must auto-renew 100 free calls');
    assert.equal(renewed.remaining, 100, 'Granted 100 free calls for new month');

    // 2. Wallet with balance $0.50 (< $1) has no free calls until top-up
    const lowBal = tracker.checkAllowance(
      'eip155:8453',
      '0x6666666666666666666666666666666666666666',
      futureMonthMs,
      500_000, // balance < $1
      0
    );
    assert.equal(lowBal.qualified, false, 'Balance < $1 must NOT auto-renew free calls');
    assert.equal(lowBal.remaining, 0, 'Remaining is 0 until top-up >= $1');
  });
});
