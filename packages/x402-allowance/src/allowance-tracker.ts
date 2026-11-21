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

import {
  MIN_TOPUP_FOR_ALLOWANCE_USD,
  FREE_CALLS_PER_MONTH_AFTER_TOPUP,
  FREE_CALLS_PER_HOUR,
  THROTTLED_FREE_CALLS_PER_HOUR,
} from './constants.ts';
import type {
  X402FreeAllowanceRow,
  X402FreeAllowanceStatus,
  X402AbuseLogRow,
} from './types.ts';

export class FreeAllowanceTracker {
  private allowances: Map<string, X402FreeAllowanceRow> = new Map();
  private callLogs: Map<string, Array<{ ts: number; tool: string; clientId: string; ip?: string }>> = new Map();
  private abuseLogs: X402AbuseLogRow[] = [];

  public getCurrentMonthStr(nowMs: number = Date.now()): string {
    const d = new Date(nowMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  public recordTopup(
    network: string,
    wallet: string,
    amountMicro: number,
    clientId?: string,
    ip?: string,
    nowMs: number = Date.now()
  ): { qualified: boolean; totalGranted: number } {
    const normNet = (network || '').trim().toLowerCase();
    const normWallet = (wallet || '').trim().toLowerCase();
    const monthStr = this.getCurrentMonthStr(nowMs);
    const key = `${normNet}:${normWallet}:${monthStr}`;

    let entry = this.allowances.get(key);
    if (!entry) {
      entry = {
        network: normNet,
        wallet: normWallet,
        month_str: monthStr,
        topup_total_micro: 0,
        allowance_granted: 0,
        calls_used: 0,
        is_throttled: 0,
        created_at: nowMs,
        updated_at: nowMs,
      };
      this.allowances.set(key, entry);
    }

    entry.topup_total_micro += amountMicro;
    const minRequiredMicro = MIN_TOPUP_FOR_ALLOWANCE_USD * 1e6;
    if (entry.topup_total_micro >= minRequiredMicro && entry.allowance_granted === 0) {
      entry.allowance_granted = FREE_CALLS_PER_MONTH_AFTER_TOPUP;
    }
    entry.updated_at = nowMs;

    return {
      qualified: entry.allowance_granted > 0,
      totalGranted: entry.allowance_granted,
    };
  }

  public checkAllowance(
    network: string,
    wallet: string,
    nowMs: number = Date.now(),
    existingMonthTopupMicro: number = 0
  ): X402FreeAllowanceStatus {
    const normNet = (network || '').trim().toLowerCase();
    const normWallet = (wallet || '').trim().toLowerCase();
    const monthStr = this.getCurrentMonthStr(nowMs);
    const key = `${normNet}:${normWallet}:${monthStr}`;

    let entry = this.allowances.get(key);

    // Auto-recognize existing top-ups in this calendar month
    if (!entry && existingMonthTopupMicro >= MIN_TOPUP_FOR_ALLOWANCE_USD * 1e6) {
      entry = {
        network: normNet,
        wallet: normWallet,
        month_str: monthStr,
        topup_total_micro: existingMonthTopupMicro,
        allowance_granted: FREE_CALLS_PER_MONTH_AFTER_TOPUP,
        calls_used: 0,
        is_throttled: 0,
        created_at: nowMs,
        updated_at: nowMs,
      };
      this.allowances.set(key, entry);
    }

    const granted = entry ? entry.allowance_granted : 0;
    const used = entry ? entry.calls_used : 0;
    const throttled = Boolean(entry?.is_throttled);
    const qualified = granted > 0;
    const remaining = Math.max(0, granted - used);

    if (!qualified || remaining <= 0) {
      return {
        qualified,
        totalGranted: granted,
        remaining,
        hourlyAllowed: false,
        hourlyCount: 0,
        throttled,
        retryAfterSeconds: 0,
        monthStr,
      };
    }

    // Pace limit enforcement
    const hourlyLimit = throttled ? THROTTLED_FREE_CALLS_PER_HOUR : FREE_CALLS_PER_HOUR;
    const oneHourAgo = nowMs - 3600_000;
    const callKey = `${normNet}:${normWallet}`;
    const recentCalls = (this.callLogs.get(callKey) || []).filter((c) => c.ts >= oneHourAgo);
    const hourlyCount = recentCalls.length;
    const hourlyAllowed = hourlyCount < hourlyLimit;

    let retryAfterSeconds = 0;
    if (!hourlyAllowed && recentCalls.length > 0) {
      const oldestCall = recentCalls[0].ts;
      retryAfterSeconds = Math.max(1, Math.ceil((oldestCall + 3600_000 - nowMs) / 1000));
    }

    return {
      qualified,
      totalGranted: granted,
      remaining,
      hourlyAllowed,
      hourlyCount,
      throttled,
      retryAfterSeconds,
      monthStr,
    };
  }

  public consumeAllowance(
    network: string,
    wallet: string,
    clientId: string,
    tool: string,
    options?: { ip?: string; nowMs?: number }
  ): { success: boolean; remaining: number; freeAllowance: true } {
    const normNet = (network || '').trim().toLowerCase();
    const normWallet = (wallet || '').trim().toLowerCase();
    const nowMs = options?.nowMs || Date.now();
    const monthStr = this.getCurrentMonthStr(nowMs);
    const key = `${normNet}:${normWallet}:${monthStr}`;

    const entry = this.allowances.get(key);
    if (!entry || entry.calls_used >= entry.allowance_granted) {
      throw new Error(`Free allowance exhausted or not qualified for wallet ${wallet}`);
    }

    entry.calls_used += 1;
    entry.updated_at = nowMs;

    const callKey = `${normNet}:${normWallet}`;
    const calls = this.callLogs.get(callKey) || [];
    calls.push({ ts: nowMs, tool, clientId, ip: options?.ip });
    this.callLogs.set(callKey, calls);

    return {
      success: true,
      remaining: Math.max(0, entry.allowance_granted - entry.calls_used),
      freeAllowance: true,
    };
  }

  public logAbuse(
    network: string,
    wallet: string,
    reason: string,
    action: string,
    clientId?: string,
    ip?: string,
    details?: string,
    nowMs: number = Date.now()
  ): void {
    this.abuseLogs.push({
      ts: nowMs,
      network,
      wallet,
      client_id: clientId,
      ip,
      reason,
      action,
      details,
    });
  }

  public getAbuseLogs(): X402AbuseLogRow[] {
    return [...this.abuseLogs];
  }
}
