/**
 * x402 Free Allowance Constants (§ENGINEER_FREE_ALLOWANCE.md v2)
 */

export const MIN_TOPUP_FOR_ALLOWANCE_USD = 1;
export const FREE_CALLS_PER_MONTH_AFTER_TOPUP = 100;

export const FREE_ALLOWANCE_DISCOVERY = {
  unlock: "any top-up of $1 or more in the calendar month",
  paidToolCallsPerMonth: FREE_CALLS_PER_MONTH_AFTER_TOPUP,
  per: "wallet address (x-wallet), per network",
  paceLimit: "none",
  resets: "monthly, 00:00 UTC on the 1st, no rollover",
  countsToward: "any priced tool call (price > 0); one call = one unit",
  excludes: "free headline (300/month) and $0 tools",
  afterAllowance: "normal pay-per-call from credit, then 402",
};
