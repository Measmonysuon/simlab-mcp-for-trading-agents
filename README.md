# Sim Lab — Perpetual Futures Intelligence & Pre-Trade Risk Veto (MCP Server)

**Pre-trade risk intelligence for AI trading agents: regime gates, pair bans, and a trap veto — before any perp entry.**

Price feeds tell your agent what happened. Sim Lab tells it whether it is
allowed to act. Sim Lab is the intelligence layer distilled from a live
fleet of perpetual-futures trading clients, exposed as **10 MCP tools**
that plug straight into Claude, GPT, Cursor, or any MCP-capable agent:

- **Regime gate** — is the market tradable at all right now? Side bans,
  market cooling, and macro event freezes (CPI / FOMC / PPI) that stand
  your agent down *before* the print, not after the loss.
- **Pair directives & quarantine** — pairs and directions the fleet's own
  history proved toxic are refused in one $0.05 call.
- **Trap shield** — VPIN toxicity, order-book imbalance and CVD
  divergence checked against your exact planned entry, pass/fail.
- **`pre_trade_check`** — all of the above in one call, one
  `ALLOW` / `VETO` verdict, $0.15. Built to sit at the top of an
  autonomous agent's entry checklist.

> **Fleet record (verify it yourself):** champion strategy *Robust
> Island SMA Retest & 30% Dynamic Harvest Champion V3* — **442 closed
> trades · 65.3% win rate · profit factor 3.71** (as of 2026-11-14).
> These figures are served live in the discovery document's proof block
> and via the `get_active_strategy` tool — never trust this README over
> the live server.

## Connect

MCP endpoint (legacy SSE transport):

```
https://simlab.measmony.me/mcp/sse
```

```json
{
  "mcpServers": {
    "simlab-alpha-intelligence": {
      "url": "https://simlab.measmony.me/mcp/sse",
      "headers": {
        "x-client-id": "<your-agent-name>",
        "x-wallet": "<your-base-wallet-address>"
      }
    }
  }
}
```

Send a **stable** `x-client-id` and your Base wallet address as
`x-wallet` on every request — your credit is bound to that pair.
Fleet operators can use a licence key instead of per-call payment
(free during beta — Telegram [@measmonysuon](https://t.me/measmonysuon)
or alpha@measmony.me).

**New agent?** Follow [AGENT_SETUP.md](AGENT_SETUP.md) — it creates
your wallets, has your user fund them, connects here, and starts the
auto-trading loop under hard risk caps. Machine-readable routing:
[llms.txt](llms.txt).

## Tools & prices

Free proves, paid decides. The `get_market_regime` **headline**
(regime name + bias + count of active restrictions) is **free**; every
actionable answer is pay-per-call in USDC on **Base** via
[x402](https://www.x402.org). Failed calls are never charged.
**Credits never expire.**

| Tool | Price (USDC) | What it decides |
|---|---|---|
| `get_market_regime` | headline free · $0.02 full | Trade at all? Side bans, cooling, macro event freezes, score gate |
| `pre_trade_check` | $0.15 | **One ALLOW/VETO verdict for a planned entry** (directive + trap shield + microstructure) |
| `evaluate_trap_shield` | $0.10 | Liquidity-trap check for one entry: VPIN, L2 imbalance, CVD divergence |
| `get_alpha_bundle` | $0.15 | The full intelligence bundle in one call |
| `check_pair_directive` | $0.05 | Is this pair tradable, which directions, quarantined? |
| `get_top_picks` | $0.05 | Ranked candidates clearing the dynamic score gate |
| `get_harvest_targets` | $0.05 | Staged take-profit zones + invalidation for one symbol |
| `get_robust_island_status` | $0.05 | Is the symbol in the champion's trend-retest pattern? |
| `get_market_microstructure` | $0.05 | Raw flow inputs: spread, depth, CVD, VPIN, liquidation clusters |
| `get_active_strategy` | $0.05 | The strategy the fleet is running now + its live record |

Prices are served live and are the source of truth:
`GET https://simlab.measmony.me/x402/info` — a GitHub Action in this
repo watches that document and flags any drift from this table.

## How payment works (x402, no account, no checkout)

1. Your agent calls a paid tool with no balance → JSON-RPC error
   **`-32042`** with a *teaser receipt* (a real, coarse risk band —
   verdict withheld, never fabricated).
2. `POST /x402/topup` → the server replies **402** with a
   machine-readable challenge (pay USDC on Base to the service wallet).
3. Your wallet signs an EIP-3009 authorization; the server verifies and
   settles it on-chain via a facilitator; your credit lands, bound to
   your `x-client-id` + wallet.
4. Retry the call — full verdict, exact per-call deduction. Replayed
   signatures are rejected (nonce-once, on-chain enforced).

Top-up packs: **$1 Trial** · **$10 Bot** (+5% credit) · **$50 Fleet**
(+10%). Minimum top-up $1. Working client code, including the two
payload rules that break every first attempt (the payload must include
`accepted`; the Base USDC EIP-712 domain name is `"USD Coin"`), lives
in [examples/](examples/).

## Proof, not promises

Payments are **live and settled on-chain** — the first settlements are
publicly verifiable on Basescan, and the security posture (payTo
integrity, replay protection, credit binding) is documented:

- [proof/RECEIPTS.md](proof/RECEIPTS.md) — settlement transactions and
  how to verify them
- [SECURITY.md](SECURITY.md) — payment-surface security summary
- Live discovery: `GET https://simlab.measmony.me/x402/info`
  (also at `https://alpha.measmony.me/.well-known/x402`)

## Example prompts

- "Before I trade today, check the Sim Lab regime — is anything banned or frozen?"
- "Is SOL/USD safe to long right now? Run the pre-trade check."
- "Give me Sim Lab's top picks and tell me which ones pass the trap shield."
- "Show me the strategy the Sim Lab fleet is running and its live record."

Bot builders: paste the standing risk-gate instruction from
[examples/prompt-pack.md](examples/prompt-pack.md) into your agent's
system prompt and Sim Lab becomes a rule, not an option.

## Notes

- Transport is **legacy SSE** (`/mcp/sse` + `/mcp/messages`).
- Payments are **Base mainnet only**. Solana support is planned for a
  later phase and is **not** accepted yet — do not send Solana payments.
- Sim Lab does not execute trades and does not provide price quotes.
  It decides *whether, where, and which direction* — execution stays
  with your agent and its venue.

*Intelligence for trading decision support. Not financial advice.
No guaranteed performance.*

## Licence

MIT (this repository's documentation and examples). The Sim Lab service
itself is operated by its owner; access is via x402 per-call payment or
licence key as described above.
