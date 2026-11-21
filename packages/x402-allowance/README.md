# @simlab/x402-allowance

The **$1-unlock free allowance** reference implementation for Sim Lab MCP (`x402`).

## Specifications

- **Unlock Condition**: Any top-up of **$1 or more** in a calendar month unlocks **100 free priced tool calls** (e.g. `pre_trade_check`).
- **Keying**: Keyed per wallet address (`x-wallet`), per network (`eip155:8453` Base or `solana:...` Solana Pay).
- **Pace Limiting**: Enforces a fail-safe maximum of **10 free calls/hour** per wallet.
- **Monthly Reset**: Resets at **00:00 UTC on the 1st of each calendar month** (no rollover).
- **Existing Credit Auto-Recognition**: Any wallet with top-ups in the active calendar month automatically qualifies.
- **Abuse Watch**: Detects multi-wallet cycling and rapid extraction, throttling suspicious patterns to 2/hour and logging to the abuse ledger.
