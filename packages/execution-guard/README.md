# @simlab/execution-guard

Strict, **code-enforced fail-closed pre-trade execution firewall** for autonomous AI trading agents.

Operating directly between your agent's LLM decision loop and exchange execution venues (Decibel DEX, Hyperliquid, Bybit, Binance, CCXT), this client interceptor guarantees that **no order can reach an exchange unless it clears Sim Lab's quantitative risk engine**.

---

## 🛡️ Why System Prompts Are Not Security Boundaries

Relying on an LLM system prompt (`"Never execute a trade if pre_trade_check returns VETO"`) is not a security boundary. Large Language Models are stochastic pattern-matchers that can hallucinate, ignore instructions during network timeouts, or suffer prompt injection.

`@simlab/execution-guard` moves enforcement into **deterministic client code**:

```
[ AI Trading Agent (LLM) ]
          │ (Intent: BUY SOL/USD)
          ▼
┌──────────────────────────────────────────────────────────────┐
│                  SIM LAB EXECUTION GUARD                     │
│  1. Parameter Validation (Symbols, Leverage, Positive Size)  │
│  2. Deterministic Pre-Trade Check via Sim Lab MCP Server     │
│  3. Round-Trip Latency Budget Guard (Fail-Closed if >2000ms) │
│  4. Stale Oracle / Market Feed Guard (Fail-Closed if >15s)   │
│  5. Network / Transport Error Guard (Strict Fail-Closed)     │
│  6. Authoritative Decision Check (ALLOW vs VETO)             │
└──────────────────────────────┬───────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
         [ ALLOW / PASS ]              [ VETO / BLOCK ]
                │                             │
    Executes safely on venue        Throws PreTradeVetoBlockedError
    (Decibel / Hyperliquid)         Order Dispatch Aborted Cleanly
                                    Zero Capital at Risk
```

---

## ⚡ Quickstart

```typescript
import { SimLabExecutionGuard, OrderIntent } from '@simlab/execution-guard';

// 1. Configure the Execution Guard with Sim Lab Client and your Exchange Adapter
const guard = new SimLabExecutionGuard(simLabClient, exchangeAdapter, {
  maxLatencyMs: 1500,        // Abort if check takes longer than 1.5s
  maxFeedAgeSeconds: 15,     // Abort if price data is older than 15s
  strictFailClosed: true     // Default: true. Network error = immediate trade halt
});

// 2. Wrap order submission in protected execution
const intent: OrderIntent = {
  symbol: 'SOL/USD',
  side: 'LONG',
  orderType: 'POST_ONLY',
  sizeUsd: 500,
  leverage: 3,
};

try {
  const result = await guard.executeProtectedOrder(intent);
  console.log(`Order placed successfully: ${result.orderId}`);
} catch (err) {
  if (err instanceof PreTradeVetoBlockedError) {
    console.warn(`Order blocked by Sim Lab Risk Veto: [${err.reasonCode}] ${err.rationale}`);
  } else if (err instanceof FailClosedExecutionError) {
    console.error(`Order blocked by Fail-Closed Safety: ${err.message}`);
  }
}
```

---

## 🧪 Fail-Closed Guarantees

Every potential failure mode defaults to **EXECUTION BLOCKED**:

| Failure Mode | Guard Behavior | Capital Risk |
| :--- | :--- | :---: |
| **Sim Lab Returns VETO** | Throws `PreTradeVetoBlockedError`. Exchange client never called. | **$0.00** |
| **Sim Lab Server Down / 5xx** | Throws `FailClosedExecutionError('NETWORK_ERROR')`. | **$0.00** |
| **Network Timeout (>2000ms)** | Throws `FailClosedExecutionError('TIMEOUT')`. | **$0.00** |
| **Stale Market Feed (>15s)** | Throws `FailClosedExecutionError('STALE_DATA')`. | **$0.00** |
| **Malformed Intent / Negative Size** | Throws `InvalidOrderIntentError`. Call aborted locally. | **$0.00** |

---

## 📄 License
MIT License.
