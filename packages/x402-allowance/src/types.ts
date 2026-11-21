/**
 * x402 Free Allowance Subsystem Types (§ENGINEER_FREE_ALLOWANCE.md v2)
 */

export interface X402FreeAllowanceRow {
  network: string;          // CAIP-2 (e.g. eip155:8453, solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp)
  wallet: string;           // Normalized wallet address
  month_str: string;        // YYYY-MM UTC
  topup_total_micro: number;// Micro-units deposited in this calendar month
  allowance_granted: number;// Total free calls granted (100)
  calls_used: number;       // Consumed free calls this month
  is_throttled: number;     // 1 if abuse detected, limiting to 2/hour
  created_at: number;       // Epoch ms
  updated_at: number;       // Epoch ms
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
