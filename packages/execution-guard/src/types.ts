/**
 * Sim Lab Execution Guard — Type Definitions
 * 
 * Strict Fail-Closed Pre-Trade Interceptor Types.
 */

export type TradeSide = 'LONG' | 'SHORT';

export interface OrderIntent {
  symbol: string;
  side: TradeSide;
  orderType: 'LIMIT' | 'MARKET' | 'POST_ONLY';
  sizeUsd: number;
  plannedPrice?: number;
  leverage: number;
  clientOrderId?: string;
  metadata?: Record<string, any>;
}

export interface RiskVerdict {
  decision: 'ALLOW' | 'VETO' | 'STAND_DOWN';
  symbol: string;
  side: TradeSide;
  timestamp: number;
  feedAgeSeconds: number;
  reasonCode: string;
  rationale: string;
  confidenceScore: number;
  recommendedLevels?: {
    suggestedEntryPrice?: number;
    amberBandUpper?: number;
    amberBandLower?: number;
    invalidationStop?: number;
    scaleOutTarget30?: number;
  };
  metrics?: {
    vpinToxicity?: number;
    cvdDivergence?: number;
    bookImbalanceRatio?: number;
  };
  attestationTicket?: string;
}

export interface SimLabClientAdapter {
  preTradeCheck(intent: OrderIntent): Promise<RiskVerdict>;
}

export interface ExchangeAdapter {
  submitOrder(intent: OrderIntent): Promise<{
    success: boolean;
    orderId: string;
    filledPrice?: number;
    status: string;
    raw?: any;
  }>;
}

export interface GuardOptions {
  /** Maximum allowable round-trip latency in ms before fail-closed abort (default: 2000ms) */
  maxLatencyMs?: number;
  /** Maximum allowable oracle / market data age in seconds before fail-closed abort (default: 15s) */
  maxFeedAgeSeconds?: number;
  /** Enforce strict fail-closed on any network, timeout, or server error (default: true) */
  strictFailClosed?: boolean;
  /** Custom logger callback */
  logger?: (level: 'info' | 'warn' | 'error', message: string, meta?: any) => void;
}
