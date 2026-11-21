/**
 * Free Allowance Tracker Subsystem
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements:
 * 1. $1 Unlock: Any top-up >= $1 unlocks 100 free priced calls for the calendar month.
 * 2. Keying: Per wallet address (x-wallet), per network (CAIP-2).
 * 3. Pace Limiting: Max 10 calls/hour per wallet (fail-safe pace gate).
 * 4. Monthly Reset: Resets 00:00 UTC on the 1st of each month (no rollover).
 * 5. Auto-Recognition: Wallets with existing top-ups in the current month automatically qualify.
 * 6. Abuse Watch: Throttles farming/rotation patterns to 2/hour and logs flags.
 */
import type { X402FreeAllowanceStatus, X402AbuseLogRow } from './types.js';
export declare class FreeAllowanceTracker {
    private allowances;
    private callLogs;
    private abuseLogs;
    getCurrentMonthStr(nowMs?: number): string;
    recordTopup(network: string, wallet: string, amountMicro: number, clientId?: string, ip?: string, nowMs?: number): {
        qualified: boolean;
        totalGranted: number;
    };
    checkAllowance(network: string, wallet: string, nowMs?: number, existingMonthTopupMicro?: number): X402FreeAllowanceStatus;
    consumeAllowance(network: string, wallet: string, clientId: string, tool: string, options?: {
        ip?: string;
        nowMs?: number;
    }): {
        success: boolean;
        remaining: number;
        freeAllowance: true;
    };
    logAbuse(network: string, wallet: string, reason: string, action: string, clientId?: string, ip?: string, details?: string, nowMs?: number): void;
    getAbuseLogs(): X402AbuseLogRow[];
}
//# sourceMappingURL=allowance-tracker.d.ts.map