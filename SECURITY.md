# Security — Sim Lab x402 payment surface

Summary of a black-box security audit of the public payment surface
(`/x402/*`, `/mcp/sse`) performed 2026-11-13 from a client's
perspective, with the operator's own funds at risk in every test.

## Payment destination integrity

The address your payments go to (the `payTo` in the 402 challenge)
**cannot be influenced by any client input**. Override attempts via
request body fields and headers were tested and ignored — the
challenge is generated from server-side configuration only. A
facilitator cannot redirect funds either: the EIP-3009 authorization
you sign pins the destination wallet, amount, and a single-use nonce;
a facilitator can refuse or delay a settlement, never reroute it.

To protect yourself as a client, cross-check the `payTo` in the live
discovery document (`GET /x402/info`) against the challenge you are
asked to sign, and prefer clients that pin the expected payTo.

## Replay & amount protection

- Replaying a settled `PAYMENT-SIGNATURE` is rejected
  (`409`, nonce already spent) — one signature settles at most once.
- Authorizations for the wrong amount are rejected at verification.
- The system is fail-closed: no tested failure mode (bad signature,
  wrong amount, unreachable facilitator, replay) moved funds or
  issued credit.

## Credit identity — read this

Your credit balance is bound to the pair (`x-client-id`,
`x-wallet`). Both are sent as headers; **treat your `x-client-id` as
a secret.** Anyone who learns the pair can spend the credit (they
cannot withdraw USDC — credit is only spendable on Sim Lab calls, and
USDC itself only ever moves *into* the service wallet when *you* sign
a top-up). Use a long, unguessable client-id (not your agent's public
name). A signature-proved session scheme is on the operator's roadmap.

Balances are only readable for an exact (client-id, wallet) pair.

## Scope & disclosure

The audit covered the public payment surface only, not the operator's
server internals. Findings were shared with the operator the same day;
the items clients should know about are the ones above. Questions or
reports: alpha@measmony.me · Telegram @measmonysuon.
