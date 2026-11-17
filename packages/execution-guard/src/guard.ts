/**
 * Sim Lab Execution Guard — Strict Fail-Closed Pre-Trade Interceptor
 * 
 * Sits directly between the autonomous trading agent / LLM and the exchange client.
 * Physically prevents order dispatch unless a fresh, verified ALLOW verdict is received.
 */

import type {
  OrderIntent,
  RiskVerdict,
  SimLabClientAdapter,
  ExchangeAdapter,
  GuardOptions,
} from './types.ts';

export class FailClosedExecutionError extends Error {
  public readonly reason: 'TIMEOUT' | 'STALE_DATA' | 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'SERVER_ERROR';
  public readonly details?: any;

  constructor(
    message: string,
    reason: 'TIMEOUT' | 'STALE_DATA' | 'NETWORK_ERROR' | 'INVALID_RESPONSE' | 'SERVER_ERROR',
    details?: any
  ) {
    super(`[SIMLAB_FAIL_CLOSED] ${message}`);
    this.name = 'FailClosedExecutionError';
    this.reason = reason;
    this.details = details;
  }
}

export class PreTradeVetoBlockedError extends Error {
  public readonly symbol: string;
  public readonly side: string;
  public readonly reasonCode: string;
  public readonly rationale: string;
  public readonly confidence: number;

  constructor(
    symbol: string,
    side: string,
    reasonCode: string,
    rationale: string,
    confidence: number
  ) {
    super(`[SIMLAB_VETO_BLOCKED] ${symbol} ${side} order aborted. Reason: [${reasonCode}] ${rationale}`);
    this.name = 'PreTradeVetoBlockedError';
    this.symbol = symbol;
    this.side = side;
    this.reasonCode = reasonCode;
    this.rationale = rationale;
    this.confidence = confidence;
  }
}

export class InvalidOrderIntentError extends Error {
  constructor(message: string) {
    super(`[SIMLAB_INVALID_INTENT] ${message}`);
    this.name = 'InvalidOrderIntentError';
  }
}

export class SimLabExecutionGuard {
  private readonly simLabClient: SimLabClientAdapter;
  private readonly exchange: ExchangeAdapter;
  private readonly maxLatencyMs: number;
  private readonly maxFeedAgeSeconds: number;
  private readonly strictFailClosed: boolean;
  private readonly logger: (level: 'info' | 'warn' | 'error', message: string, meta?: any) => void;

  constructor(
    simLabClient: SimLabClientAdapter,
    exchange: ExchangeAdapter,
    options?: GuardOptions
  ) {
    this.simLabClient = simLabClient;
    this.exchange = exchange;
    this.maxLatencyMs = options?.maxLatencyMs ?? 2000;
    this.maxFeedAgeSeconds = options?.maxFeedAgeSeconds ?? 15;
    this.strictFailClosed = options?.strictFailClosed ?? true;
    this.logger = options?.logger ?? ((level, msg, meta) => {
      if (level === 'error') console.error(`[EXECUTION_GUARD] ${msg}`, meta ?? '');
      else if (level === 'warn') console.warn(`[EXECUTION_GUARD] ${msg}`, meta ?? '');
      else if (process.env.DEBUG) console.log(`[EXECUTION_GUARD] ${msg}`, meta ?? '');
    });
  }

  /**
   * Validate order intent parameters before transmitting to firewall.
   */
  public validateIntent(intent: OrderIntent): void {
    if (!intent.symbol || typeof intent.symbol !== 'string' || !intent.symbol.includes('/')) {
      throw new InvalidOrderIntentError(`Invalid symbol format: "${intent.symbol}". Expected format: BASE/QUOTE (e.g. BTC/USD).`);
    }
    if (intent.side !== 'LONG' && intent.side !== 'SHORT') {
      throw new InvalidOrderIntentError(`Invalid side: "${intent.side}". Must be LONG or SHORT.`);
    }
    if (typeof intent.sizeUsd !== 'number' || intent.sizeUsd <= 0 || isNaN(intent.sizeUsd)) {
      throw new InvalidOrderIntentError(`Invalid sizeUsd: ${intent.sizeUsd}. Must be a positive finite number.`);
    }
    if (typeof intent.leverage !== 'number' || intent.leverage < 1 || intent.leverage > 100) {
      throw new InvalidOrderIntentError(`Invalid leverage: ${intent.leverage}. Must be an integer between 1 and 100.`);
    }
  }

  /**
   * Evaluates the pre-trade check and strictly enforces fail-closed semantics.
   * Throws FailClosedExecutionError on any failure mode.
   * Throws PreTradeVetoBlockedError if Sim Lab issues a VETO or STAND_DOWN.
   */
  public async verifyOrderApproval(intent: OrderIntent): Promise<RiskVerdict> {
    this.validateIntent(intent);

    const startTime = Date.now();
    let verdict: RiskVerdict;

    try {
      // 1. Invoke Sim Lab Pre-Trade Check
      verdict = await this.simLabClient.preTradeCheck(intent);
    } catch (err: any) {
      this.logger('error', `Pre-trade check failed due to network or transport error`, { error: err.message });
      if (this.strictFailClosed) {
        throw new FailClosedExecutionError(
          `Sim Lab risk gate unreachable or returned error: ${err.message}. Order execution blocked by fail-closed policy.`,
          'NETWORK_ERROR',
          { originalError: err.message }
        );
      }
      throw err;
    }

    const elapsedMs = Date.now() - startTime;

    // 2. Latency Threshold Enforcement (Fail-Closed)
    if (elapsedMs > this.maxLatencyMs) {
      this.logger('error', `Gate latency exceeded allowable budget`, { elapsedMs, maxLatencyMs: this.maxLatencyMs });
      if (this.strictFailClosed) {
        throw new FailClosedExecutionError(
          `Pre-trade check took ${elapsedMs}ms, exceeding max latency budget of ${this.maxLatencyMs}ms. Order blocked due to stale decision window.`,
          'TIMEOUT',
          { elapsedMs, maxLatencyMs: this.maxLatencyMs }
        );
      }
    }

    // 3. Stale Oracle / Market Data Check (Fail-Closed)
    if (typeof verdict.feedAgeSeconds === 'number' && verdict.feedAgeSeconds > this.maxFeedAgeSeconds) {
      this.logger('error', `Market feed data is stale`, { feedAgeSeconds: verdict.feedAgeSeconds });
      if (this.strictFailClosed) {
        throw new FailClosedExecutionError(
          `Underlying market data feed is ${verdict.feedAgeSeconds}s old (exceeds threshold of ${this.maxFeedAgeSeconds}s). Order blocked to prevent trading on stale quotes.`,
          'STALE_DATA',
          { feedAgeSeconds: verdict.feedAgeSeconds, maxAllowed: this.maxFeedAgeSeconds }
        );
      }
    }

    // 4. Invariant: Decision must be explicitly 'ALLOW'
    if (verdict.decision !== 'ALLOW') {
      this.logger('warn', `Order VETOED by Sim Lab Risk Firewall`, {
        symbol: intent.symbol,
        side: intent.side,
        reasonCode: verdict.reasonCode,
        rationale: verdict.rationale,
      });
      throw new PreTradeVetoBlockedError(
        intent.symbol,
        intent.side,
        verdict.reasonCode || 'GENERIC_VETO',
        verdict.rationale || 'Pre-trade risk firewall rejected this setup.',
        verdict.confidenceScore ?? 0
      );
    }

    this.logger('info', `Order cleared Sim Lab Pre-Trade Risk Firewall`, {
      symbol: intent.symbol,
      side: intent.side,
      elapsedMs,
      confidence: verdict.confidenceScore,
    });

    return verdict;
  }

  /**
   * Protected Order Execution:
   * Combines verification and exchange submission in an atomic pipeline.
   * If verification throws, this.exchange.submitOrder is physically unreachable.
   */
  public async executeProtectedOrder(intent: OrderIntent): Promise<{
    orderId: string;
    verdict: RiskVerdict;
    rawExchangeResult: any;
  }> {
    // Step 1: Pre-Trade Verification (Throws on failure/veto)
    const verdict = await this.verifyOrderApproval(intent);

    // Step 2: Order Dispatch to Exchange (Only reachable on valid ALLOW)
    const exchangeResult = await this.exchange.submitOrder(intent);

    return {
      orderId: exchangeResult.orderId,
      verdict,
      rawExchangeResult: exchangeResult,
    };
  }
}
