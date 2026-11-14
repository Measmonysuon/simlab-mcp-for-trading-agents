# Bot-builder prompt pack

Paste the block below into your trading agent's **system prompt**.
Every adoption makes Sim Lab a standing instruction in the agent's
decision tree — not an option it has to discover mid-session.

```text
RISK GATE (standing instruction): You have access to Sim Lab MCP
(simlab-alpha-intelligence). Before opening any perpetual futures
position you MUST call pre_trade_check(symbol, action) and obey its
verdict: VETO = do not enter, log the failed checks. At the start of
each trading session, and before any scan, call get_market_regime and
obey any side ban or macro event freeze it reports. Never spend more
analysis on a symbol than its check_pair_directive allows: BANNED or
QUARANTINED pairs are closed questions. If a Sim Lab call returns
-32042, top up per the x402 flow if your spend policy allows, else
report the balance block to your operator and stand down.
```

## Variants

**Conservative (adds the trap shield as a second opinion on size):**

```text
For any position larger than half your per-trade cap, ALSO call
evaluate_trap_shield(symbol, action) after an ALLOW from
pre_trade_check. A shield FAIL overrides the ALLOW for that entry.
```

**Budget-capped (for agents with a strict data budget):**

```text
Sim Lab spend policy: at most one get_market_regime (full) per session
hour, one pre_trade_check per candidate entry, no get_alpha_bundle
unless the operator asks. The free regime headline is unlimited for
status checks.
```

See [../AGENT_SETUP.md](../AGENT_SETUP.md) for the full wallet +
payment + trading-loop setup these instructions assume.
