# AGENT SETUP — Connect Any AI Agent to Sim Lab Intelligence + Auto-Trading

**For:** any AI agent with tool/code execution and an MCP or HTTP client —
Claude, GPT, Muse, Gemini, or a custom agent framework.
**What you (the agent) will do, in order:** create wallets → alert your user
to fund them → connect to Sim Lab for trading intelligence → connect a
trading venue → run the auto-trading loop under hard risk caps.
**Time:** ~20–40 minutes, most of it waiting for your user to fund a wallet.

> **How to use this file:** execute the steps in order. Do not skip the
> verification line at the end of each step — if it fails, stop and fix that
> step before continuing. Steps marked 🛑 require your user's explicit
> confirmation before you proceed.

---

## 0. Ground rules (read first, they override everything below)

1. **You never hold, buy, or move your user's money yourself.** You create
   wallet *addresses*; your user funds them from their own exchange/wallet.
2. **Private keys never appear in chat, logs, commits, or messages.** Store
   keys only in a local secret file (`chmod 600`) or your platform's secret
   store, and refer to them by address only.
3. **Paper mode is the default.** Live trading starts only after the 🛑
   GO-LIVE step (§6), with risk caps your user has seen and approved.
4. **Sim Lab is a risk filter, not a profit promise.** Its `VETO` means
   "do not trade." Its `ALLOW` means "this setup passed the filters" —
   never a guarantee. Never tell your user otherwise.
5. **Hard caps beat signals.** Position limits, daily-loss stop, and the
   kill switch (§7) override any signal, always.
6. **Every fill, veto, top-up, and error gets reported to your user**
   (§8 templates). Silence is only for routine scans with no action.

---

## 1. Create the wallets

Create **two** wallets. Keeping them separate means the small intelligence
budget can never touch trading capital.

| # | Wallet | Chain | Purpose | Funded with |
|---|---|---|---|---|
| A | **Intel wallet** | Base (EVM) | Pays Sim Lab per-call via x402 | USDC on Base |
| B | **Trading wallet** | your venue's chain | Margin/collateral at the trading venue | per venue (§5) |

**Create Wallet A** with any standard EVM tooling, e.g.:

- Node (viem/ethers): generate a new private key + address programmatically.
- Python (`eth-account`): `Account.create()`.
- CLI: `cast wallet new` (Foundry).

Save the key to a local secret file (example path: `~/.agent/simlab_wallet.env`,
permissions `600`) — never print it. Record only the **address** in your
working notes.

**Wallet B** depends on the venue chosen in §5 (an EVM wallet for
Hyperliquid-style venues, an Aptos wallet for Decibel, or an exchange
API key pair the *user* creates — if API keys are used, the user creates
them with trade-only permission, **withdrawals disabled**, and pastes them
through your platform's secure/secret channel, never plain chat).

✅ *Verify:* you can state both addresses from memory/notes, and no private
key exists anywhere in your conversation transcript.

---

## 2. 🛑 Alert your user to fund the wallets

Send your user the wallet list **exactly in this shape** (fill in your
addresses), then **stop and wait** for funding confirmation:

> **🔐 Your agent wallets are ready — please fund them**
>
> | Wallet | Network | Address | Send | Suggested |
> |---|---|---|---|---|
> | Intel (Sim Lab data) | **Base** | `<WALLET_A_ADDRESS>` | USDC | $10 |
> | Trading | `<VENUE_NETWORK>` | `<WALLET_B_ADDRESS>` | `<ASSET>` | your chosen trading capital |
>
> ⚠️ Send **USDC on the Base network only** to the Intel wallet — USDC sent
> on any other network will not arrive and cannot be recovered by the agent.
> The Intel wallet pays for market intelligence per call ($0.02–$0.15);
> $10 ≈ 60–400 calls. Trading capital stays separate and is never used
> for data fees.
>
> Reply **"funded"** when done, and I will verify on-chain and continue.

While waiting, do §3 (the free parts need no funds).

**When your user says funded:** verify on-chain before proceeding —
check the USDC balance of Wallet A on Base (`balanceOf` on the USDC
contract below, via any public Base RPC). If it reads 0, the funds went to
the wrong network or haven't landed; tell your user and wait.

✅ *Verify:* Wallet A USDC balance on Base > 0.

---

## 3. Connect to Sim Lab (intelligence layer)

| Item | Value |
|---|---|
| MCP endpoint | `https://simlab.measmony.me/mcp/sse` (legacy SSE transport) |
| Discovery doc | `GET https://simlab.measmony.me/x402/info` (public, no auth) |
| Identity headers | `x-client-id: <pick a stable id, e.g. your agent name>` + `x-wallet: <WALLET_A_ADDRESS>` — send both on **every** MCP and x402 request |
| USDC contract (Base) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Payments network | Base mainnet only (`eip155:8453`) — Solana is Phase 2, do not attempt it |

**Connect and sample the free tier first:**

1. `GET /x402/info` — read the live price table and proof block. Treat this
   document as the source of truth for prices (they can change).
2. Open the MCP SSE session, `initialize`, `tools/list` — expect 10 tools:
   `get_market_regime`, `get_alpha_bundle`, `check_pair_directive`,
   `get_top_picks`, `get_harvest_targets`, `get_robust_island_status`,
   `get_market_microstructure`, `evaluate_trap_shield`,
   `get_active_strategy`, `pre_trade_check`.
3. Call `get_market_regime` with no balance — you should receive the free
   **headline** (regime name + bias only). That is the free tier working.

✅ *Verify:* tools list has 10 tools and the free headline returns.

---

## 4. Top up Sim Lab credit (x402 — you do this autonomously)

Credits buy the paid calls. The handshake, exactly as proven live:

1. `POST /x402/topup` with headers from §3 and body
   `{"packUsd": 1, "clientId": "<your x-client-id>"}`.
   Packs: **$1** trial · **$10** (+5% bonus credit) · **$50** (+10%).
   Start with $1 to prove your pipeline, then $10 for operations.
2. The server replies **402** with a `PAYMENT-REQUIRED` header — base64-decode
   it. Choose the `accepts[]` entry with `network: "eip155:8453"`.
3. Sign an **EIP-3009 `TransferWithAuthorization`** with Wallet A:
   `from` = Wallet A, `to` = the entry's `payTo`, `value` = the entry's
   `amount` (atomic units; $1 = `1000000`), fresh random 32-byte `nonce`,
   `validBefore` = now + ~100s.
   ⚠️ **Two rules that break every first attempt if missed:**
   - The EIP-712 domain name is **`"USD Coin"`** (version `"2"`, chainId
     `8453`, verifyingContract = the USDC contract) — *not* `"USDC"`, no
     matter what any example or challenge field suggests. Read the domain
     from the challenge's `extra` when present.
   - The payment payload **must include the `accepted` field** (the accept
     entry you chose) and the challenge's `resource` — servers reject
     payloads without them.
4. Re-send the same `POST /x402/topup` with header
   `PAYMENT-SIGNATURE: <base64 of the payload>` where the payload is
   `{x402Version: 2, scheme: "exact", network, accepted, resource,
   payload: {signature, authorization}}`.
5. Success = **HTTP 200** + a decoded `PAYMENT-RESPONSE` header with
   `success: true` and a transaction hash. Your USDC moved to Sim Lab's
   wallet; your credit is bound to your `x-client-id` + Wallet A.
   A replayed signature is rejected (`409`, nonce already spent) — that
   is by design; generate a fresh authorization for every top-up.

Check your balance any time: `GET /x402/balance` (same identity headers).

**During trading (§7):** a paid call made with insufficient balance returns
JSON-RPC error **`-32042`** with a teaser receipt (coarse risk band only).
On `-32042`: run this top-up flow, then **retry the original call once**.
Never loop retries without topping up.

✅ *Verify:* after a $1 top-up, `/x402/balance` shows `1000000` (micro-USDC).

**Prices that matter** (confirm live in `/x402/info`):
`pre_trade_check` $0.15 · `evaluate_trap_shield` $0.10 ·
`get_alpha_bundle` $0.15 · most tools $0.05 · full `get_market_regime`
$0.02 (headline free). Failed/errored calls are not charged.

---

## 5. Connect the trading venue

Sim Lab supplies intelligence only — execution happens at a venue **your
user chooses**. Implement one adapter with this contract:

```
getBalance()            -> available margin (USD)
getPosition(symbol)     -> open position or null
placeOrder({symbol, side, sizeUsd, stopLossPct, takeProfitPct}) -> fill {price, id}
closePosition(symbol)   -> exit {price}
```

Reference paths:

- **Decibel (Aptos perps)** — the venue Sim Lab's fleet trades; the Alpha
  Autonomous Client is the reference integration (it consumes Sim Lab
  exactly as §7 describes). If your user runs Alpha, your job is §3–§4 +
  monitoring, and Alpha executes.
- **Hyperliquid / other EVM perps** — Wallet B signs orders directly.
- **Centralized exchange** — user-created trade-only API keys (§1).

Whatever the venue: **stop-loss and take-profit are mandatory on every
order.** No naked positions, ever. Start the adapter in **paper mode**:
log intended orders with live prices instead of sending them.

✅ *Verify:* in paper mode, a test signal produces a logged intended order
with entry, SL, and TP — and no real order exists at the venue.

---

## 6. 🛑 GO-LIVE gate (user approval + risk caps)

Do not trade live until your user has seen and approved this table
(defaults shown — your user may tighten, never loosen without saying so
explicitly):

| Cap | Default |
|---|---|
| Mode | paper → live only on user's "GO LIVE" |
| Max open positions | 1 |
| Max position size | $100 |
| Stop loss / take profit | 1.5% / 3.0% from entry |
| Daily loss stop | −2% of trading capital → halt for the day |
| Intel budget guard | pause loop if Sim Lab credit < $1; alert user |

✅ *Verify:* user replied GO LIVE with caps acknowledged; caps are stored
in your config, not just in chat.

---

## 7. The auto-trading loop

Run on a fixed cadence (15 minutes is a sane default) or on regime change:

1. **Regime gate.** Call `get_market_regime` (full, $0.02). If the regime
   bans a side (e.g. long-ban during outflow regimes) or an event freeze
   is active → **no new trades this cycle.** Log the reason.
2. **Candidates.** From `get_top_picks` / your user's watchlist, take at
   most one candidate per cycle (respect the position cap).
3. **Pre-trade check (mandatory).** Call `pre_trade_check`
   `{symbol, side}` ($0.15).
   - `VETO` → do not trade. Log the veto reasons; report per §8.
   - `ALLOW` → proceed. (For high-value size, optionally add
     `evaluate_trap_shield`, $0.10, as a second opinion.)
4. **Size + execute.** Size = the *smaller* of (cap, your user's sizing
   rule). Place the order with SL/TP attached (§5).
5. **Manage.** Each cycle: if SL/TP hit → record exit + PnL. If Sim Lab's
   regime flips against an open position → alert your user immediately;
   close only if your user's rules say so.
6. **Refill.** Before each paid call, if credit < call price, top up (§4)
   — on `-32042`, top up then retry once.
7. **Daily stop.** If today's realized PnL ≤ the daily loss stop → halt
   entries until tomorrow; tell your user.

**Kill switch:** if your user sends **STOP** at any time → cancel the
loop, place no new orders, and ask whether to close or hold any open
position. Confirm the halt in your reply.

---

## 8. What you must alert your user (templates)

- **Funding request** — the §2 wallet list. (Once, at setup.)
- **Funding confirmed** — "✅ Intel wallet funded: $X USDC on Base.
  Sim Lab credit after top-up: $Y. Loop starting in paper mode."
- **Top-up receipt** — amount, tx hash, new credit balance.
- **Entry fill** — symbol, side, entry price, SL, TP, size, and the
  `pre_trade_check` verdict that allowed it.
- **Veto** — symbol, side, and Sim Lab's blocking reasons (one line each).
- **Exit** — exit price, PnL in $ and %, reason (TP / SL / regime flip /
  manual).
- **Daily summary** — trades taken, vetoes, PnL, credit spent on data,
  credit remaining.
- **Problems, immediately** — funding not detected, `-32042` loop,
  venue errors, daily loss stop hit, kill switch engaged.

---

## 9. Troubleshooting (the failures that actually happen)

| Symptom | Cause | Fix |
|---|---|---|
| Top-up verify fails / invalid signature | EIP-712 domain name wrong | Use `"USD Coin"`, version `"2"` (§4) |
| Server 400 on top-up | Payload missing `accepted` | Include the chosen accept entry + `resource` (§4) |
| `409` nonce spent | Signature replayed | Fresh nonce + fresh authorization per top-up |
| Paid call returns `-32042` | Credit exhausted | Top up (§4), retry the call once |
| Funded wallet still shows 0 | USDC sent on the wrong network | It must be **Base**; other networks are unrecoverable by you — tell your user |
| MCP connects but no paid data | Missing identity headers | Send `x-client-id` + `x-wallet` on every request |

---

## 10. What this setup is — and is not

This connects your agent to a live intelligence feed whose published track
record (442 closed trades, 65.3% win rate, profit factor 3.71, as of
2026-11-13 — live figures in the discovery doc's proof block) it uses to
gate trades. It removes bad trades; it does not and cannot guarantee
profitable ones. Your user's capital is at risk in live mode — that is
why paper mode, hard caps, and the GO-LIVE gate exist.

*Sim Lab access for fleets/operators (licence key instead of per-call):
Telegram **@measmonysuon** · **alpha@measmony.me**.*
*Discovery: `GET https://simlab.measmony.me/x402/info` · Landing:
`https://alpha.measmony.me`.*
