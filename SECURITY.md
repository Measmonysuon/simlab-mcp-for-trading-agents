# Security — Sim Lab x402 Payment & MCP Execution Surface

Summary of black-box security audits of the public payment surface (`/x402/*`, `/mcp/sse`) performed 2026-11-13 and 2026-11-14 from an external client's perspective, with real funds and live on-chain settlements.

---

## 1. Payment Destination Integrity & Tamper Protection

The address your payments go to (the `payTo` in the 402 challenge) **cannot be influenced by any client input**.
- Override attempts via request body fields (`payTo`, `payToByNetwork`) and headers (`x-pay-to`, `payTo`) were probed and ignored — the challenge is generated strictly from server-side configuration.
- Facilitators cannot redirect funds: the EIP-3009 `TransferWithAuthorization` you sign cryptographically binds the destination address (`to`), exact atomic value, and a single-use random nonce. A facilitator can only submit the transaction or refuse/delay it, never reroute funds.
- **Hourly Canary Watchdog**: An automated watchdog runs hourly from independent host tasks, querying live discovery documents from both `simlab.measmony.me` and `alpha.measmony.me` plus fresh 402 challenges to assert that `payTo` strictly equals `0x5ae6a0d1c1698be0b08d1a4b701fa8a9489ee5af`.

To protect yourself as a client, cross-check the `payTo` in the live discovery document (`GET /x402/info`) against the challenge before signing.

---

## 2. Replay Protection & Amount Verification

- **Replay Protection**: Replaying a settled `PAYMENT-SIGNATURE` is rejected (`409 Conflict: Nonce has already been spent`). One cryptographic authorization settles at most once.
- **Amount Verification**: Authorizations for the wrong amount are rejected at verification (`authorization_value_mismatch`).
- **Fail-Closed Guarantee**: Every tested failure mode (bad signature, wrong amount, unreachable facilitator, replay) moves zero funds and credits zero balance.

---

## 3. Session-Binding & Spend Isolation (Audit 2 Verified)

- **Session Hijacking Defense**: MCP message endpoints (`POST /mcp/messages?sessionId=<uuid>`) strictly enforce identity binding against the session creator.
- Every message POST must carry the matching `x-client-id` and `x-wallet` headers that were bound when the SSE session was opened:
  - Mismatching `x-client-id` $\rightarrow$ **HTTP 403 Forbidden** (`Session identity mismatch`).
  - Missing `x-client-id` $\rightarrow$ **HTTP 403 Forbidden**.
  - Mismatching `x-wallet` $\rightarrow$ **HTTP 403 Forbidden**.
- **Result**: Even if a session URL is logged or intercepted, a third party cannot inject tool calls or spend the victim's balance.

---

## 4. Input Validation & Balance Privacy

- **Top-up Input Validation**: `packUsd` is strictly validated server-side. Must be a finite number between $1.00 and $10,000.00 USDC. Negative numbers, `NaN`, non-numbers, and sub-$1 amounts are rejected with **HTTP 400 Bad Request**.
- **Balance Reconnaissance Defense**: `GET /x402/balance` strictly requires both `x-client-id` and `x-wallet`. Requests omitting `x-wallet` or requesting `wallet=all` are rejected with **HTTP 400 Bad Request**, preventing unauthorized enumeration of funded client IDs.
- **Concurrency & Double-Spend Defense**: In `finalizePaidTool`, if concurrent requests race for the same credit balance, any uncharged execution is aborted immediately with `McpError(-32042)`. Tool results are never served without confirmed deduction from the SQLite WAL ledger.

---

## 5. Credit Identity Best Practices

Your credit balance is bound to the pair (`x-client-id`, `x-wallet`).
- **Treat your `x-client-id` as a private secret.** Use a long, unguessable identifier (e.g. UUID v4 or random hex token) rather than your agent's public name.
- Anyone holding both values can spend the credit on Sim Lab tool calls (they cannot withdraw USDC — credit is non-transferable and USDC only ever moves into the service treasury when *you* sign an authorization).
- Credit balances never expire in v1.

---

## 6. Scope & Disclosure

Audits cover the public HTTP 402 and MCP SSE surfaces. Questions, vulnerability reports, or security disclosures:
- **Email**: [alpha@measmony.me](mailto:alpha@measmony.me)
- **Telegram**: [@measmonysuon](https://t.me/measmonysuon)
