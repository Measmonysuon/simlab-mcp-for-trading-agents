# Settlement receipts — verify everything yourself

Sim Lab's x402 pay-per-call system settled real USDC on **Base
mainnet** on 2026-11-13, end-to-end, in a black-box test run by an
independent client (a throwaway test wallet, no licence key, no
special access — exactly what any agent gets).

## The settlements

| # | Amount | Transaction (Basescan) | What it proves |
|---|---|---|---|
| 1 | $1.00 USDC | [0xbd4848324fc4…82e5a49](https://basescan.org/tx/0xbd4848324fc4bbafd52c12756f6c0483cdf7f4693468c5982dd02f80382e5a49) | Top-up → credit issued (1,000,000 micro) → receipt `success: true` |
| 2 | $1.00 USDC | [0x84af0483e0f0…f64f98](https://basescan.org/tx/0x84af0483e0f0268cb0b9ccc341481c63b1683366ac9b5a1f80429abdf5b64f98) | Repeatability — and the replay of THIS signature was then rejected |

## What else the same test run verified

- **Paid calls deduct exactly:** `pre_trade_check` −$0.15,
  full `get_market_regime` −$0.02, balances to the micro-unit.
- **Replay protection:** re-sending settlement #2's identical
  `PAYMENT-SIGNATURE` → HTTP `409` *"Nonce has already been spent"*,
  no second settle, no double credit.
- **Amount integrity:** an authorization signed for the wrong amount
  was rejected at verification; no credit issued. Every failure in the
  run moved **zero** funds (fail-closed).
- **Pay-to integrity:** attempts to override the destination wallet
  via request body or headers were ignored — the payment challenge is
  generated from server config only.
- **Credit binding:** balances and spending are keyed to the
  (x-client-id + wallet) pair together; presenting one without the
  other yields a zero balance and refused calls.

## Verify the live state any time

```bash
# Prices, pay-to wallet, proof block (fleet record) — public, no auth:
curl https://simlab.measmony.me/x402/info

# The fleet's own live record, from the fleet itself:
# call the get_active_strategy tool over MCP (priced $0.05, or free
# with a licence key).
```

Fleet figures quoted anywhere in this repository (442 closed trades ·
65.3% win rate · profit factor 3.71, as of 2026-11-14) come from that
discovery document's proof block — re-pull it rather than trusting
this file.
