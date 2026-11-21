/**
 * x402 Free Allowance Subsystem Types (§ENGINEER_FREE_ALLOWANCE.md v2)
 */
export interface X402FreeAllowanceRow {
    network: string;
    wallet: string;
    month_str: string;
    topup_total_micro: number;
    allowance_granted: number;
    calls_used: number;
    is_throttled: number;
    created_at: number;
    updated_at: number;
}
export interface X402FreeAllowanceCallRecord {
    id?: number;
    ts: number;
    network: string;
    wallet: string;
    client_id: string;
    tool: string;
    ip?: string;
}
export interface X402FreeAllowanceStatus {
    qualified: boolean;
    totalGranted: number;
    remaining: number;
    hourlyAllowed: boolean;
    hourlyCount: number;
    throttled: boolean;
    retryAfterSeconds: number;
    monthStr: string;
}
export interface X402AbuseLogRow {
    id?: number;
    ts: number;
    network: string;
    wallet: string;
    client_id?: string;
    ip?: string;
    reason: string;
    action: string;
    details?: string;
}
//# sourceMappingURL=types.d.ts.map