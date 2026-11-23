# 📜 Sim Lab MCP Tool Catalog & Contract Schemas
*Specification Version: 1.3.1 | Protocol: MCP (2025-07-09) over SSE & JSON-RPC 2.0*

This document provides formal input/output contracts, parameter constraints, and error response schemas for all 12 Sim Lab Model Context Protocol (MCP) tools.

---

## ⚡ Global Standards & Transport

* **Transport**: Server-Sent Events (`GET /mcp/sse`) with bi-directional message routing (`POST /mcp/messages?sessionId=<uuid>`).
* **Micro-Billing**: x402 Protocol in USDC on Base Mainnet.
* **Headers**:
  * `x-client-id` *(required)*: Unique agent identifier.
  * `x-wallet` *(required)*: Base EVM wallet address.
  * `x-spend-key` *(required for paid tools)*: 192-bit cryptographic authorization key.

---

## 🛠️ Tool Catalog & Input / Output Contracts

### 1. `pre_trade_check` (Master Risk Firewall)
* **Pricing**: $0.15 USDC (x402)
* **Purpose**: Authoritative pre-trade decision combining regime, historical pair quarantine, and order flow microstructure.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "symbol": {
      "type": "string",
      "description": "Perpetual trading pair in BASE/QUOTE format (e.g. BTC/USD, SOL/USD)",
      "pattern": "^[A-Z0-9]+/[A-Z0-9]+$"
    },
    "side": {
      "type": "string",
      "description": "Proposed trade direction",
      "enum": ["LONG", "SHORT"]
    },
    "plannedPrice": {
      "type": "number",
      "description": "Target limit entry price in quote currency",
      "minimum": 0
    },
    "leverage": {
      "type": "integer",
      "description": "Intended position leverage multiple",
      "minimum": 1,
      "maximum": 50
    }
  },
  "required": ["symbol", "side"]
}
```

#### Output Schema
```json
{
  "decision": "ALLOW" | "VETO" | "STAND_DOWN",
  "symbol": "SOL/USD",
  "side": "LONG",
  "confidenceScore": 88,
  "timestamp": 1731818400000,
  "feedAgeSeconds": 1.2,
  "reasonCode": "CLEARED_ALL_SHIELDS" | "VPIN_TOXIC_SPIKE" | "REGIME_LOCKOUT" | "HISTORICAL_QUARANTINE",
  "rationale": "Microstructure absorption confirmed, low VPIN, no macro lockout.",
  "recommendedLevels": {
    "suggestedEntryPrice": 152.40,
    "amberBandUpper": 154.20,
    "amberBandLower": 151.10,
    "invalidationStop": 149.80,
    "scaleOutTarget30": 155.60
  },
  "metrics": {
    "vpinToxicity": 0.18,
    "cvdDivergence": -0.8,
    "bookImbalanceRatio": 1.12
  }
}
```

---

### 2. `get_golden_entry` (Institutional Entry Precision)
* **Pricing**: $0.03 USDC (x402)
* **Purpose**: Computes dynamic moving baseline (Golden Line), Amber Upper/Lower bands, and retest absorption health score (0–100).

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "symbol": {
      "type": "string",
      "description": "Perpetual pair symbol (e.g. ETH/USD)",
      "pattern": "^[A-Z0-9]+/[A-Z0-9]+$"
    }
  },
  "required": ["symbol"]
}
```

#### Output Schema
```json
{
  "symbol": "ETH/USD",
  "action": "ENTER_LONG" | "WAIT_PULLBACK" | "STAND_DOWN" | "KNIFE_WARNING",
  "levels": {
    "currentPrice": 3140.50,
    "goldenLine": 3115.20,
    "amberBand": {
      "upper": 3180.00,
      "lower": 3090.00,
      "spreadPct": 2.91
    },
    "entryZone": {
      "min": 3110.00,
      "ideal": 3115.20,
      "max": 3125.00
    },
    "invalidationFloor": 3075.00
  },
  "retestMetrics": {
    "retestHealth": 84,
    "distanceToGoldenPct": 0.81,
    "state": "RETEST_CONFIRMED",
    "exhaustionConfirmed": true,
    "knifeRisk": "LOW"
  },
  "riskReward": {
    "ratio": 2.35,
    "isAcceptable": true
  }
}
```

---

### 3. `evaluate_dynamic_exit` (In-Trade Profit Sentinel)
* **Pricing**: $0.01 USDC (x402)
* **Purpose**: Called during an active position to evaluate momentum decay, harvest partial gains, and ratchet trailing stops.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "symbol": { "type": "string" },
    "side": { "type": "string", "enum": ["LONG", "SHORT"] },
    "entryPrice": { "type": "number", "minimum": 0 },
    "currentPrice": { "type": "number", "minimum": 0 },
    "positionAgeMinutes": { "type": "integer", "minimum": 0 },
    "unrealizedPnlPct": { "type": "number" }
  },
  "required": ["symbol", "side", "entryPrice", "currentPrice"]
}
```

#### Output Schema
```json
{
  "action": "HOLD" | "HARVEST_PARTIAL_30" | "RATCHET_BREAKEVEN" | "CLOSE_FULL_EXIT",
  "suggestedStopPrice": 3125.50,
  "scaleOutRecommended": true,
  "scaleOutPct": 30,
  "momentumState": "MOMENTUM_CURVATURE_FLATTENING",
  "urgency": "NORMAL" | "HIGH"
}
```

---

### 4. `get_market_regime` (Global Macro Gate)
* **Pricing**: Free Headline | $0.02 USDC Full Unlocked
* **Purpose**: Global macro regime, aggregate volatility tier, active macroeconomic freezes (FOMC, CPI, PPI).

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "tier": {
      "type": "string",
      "enum": ["headline", "full"],
      "description": "Optional tier. 'headline' returns free coarse macro bias (keyless, 300/mo). 'full' returns full actionable regime ($0.02 or 1 free allowance unit). Defaults to 'headline' if unpaid."
    },
    "full": {
      "type": "boolean",
      "description": "Alias for tier='full'. When true, requests the paid full actionable regime."
    }
  }
}
```

#### Output Schema (Free Headline)
```json
{
  "tier": "FREE_COARSE",
  "headlineRegime": "RISK_ON_BETA" | "BULLISH" | "BEARISH" | "NEUTRAL",
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "asOf": "2026-11-21T09:10:54.238Z",
  "restrictionsActive": 0,
  "freeTierNotice": "Coarse headline only. Top-up credits via POST /x402/topup for direction bans, event freezes, and entry scoring.",
  "paidUnlocks": ["directionBans", "eventFreezes", "entryScoring", "cooling"]
}
```

#### Output Schema (Full Unlocked / Paid)
```json
{
  "regime": "SELECTIVE_EXPANSION" | "SIMULTANEOUS_OUTFLOW" | "COMPRESSION_CHOP",
  "directionalBias": "BULLISH" | "BEARISH" | "NEUTRAL",
  "riskMultiplier": 1.25,
  "macroLockoutActive": false,
  "activeEvents": [],
  "confidenceScore": 88
}
```

---

### 5. `evaluate_trap_shield` (Microstructure Liquidity Shield)
* **Pricing**: $0.10 USDC (x402)
* **Purpose**: Analyzes Volume-Synchronized Probability of Toxicity (VPIN), L2 spoofing walls, and CVD flow divergence.

#### Input Schema
```json
{
  "type": "object",
  "properties": {
    "symbol": { "type": "string" },
    "side": { "type": "string", "enum": ["LONG", "SHORT"] },
    "targetPrice": { "type": "number", "minimum": 0 }
  },
  "required": ["symbol", "side"]
}
```

#### Output Schema
```json
{
  "shieldVerdict": "SAFE" | "TOXIC_TRAP",
  "vpinScore": 0.19,
  "vpinThreshold": 0.35,
  "cvdDivergence": -0.6,
  "restingDepthImbalance": 1.15,
  "liquidationClusterDensity": "LOW",
  "trapTypeDetected": "NONE" | "RESTING_SPOOF_ASK" | "EXHAUSTION_DUMP"
}
```

---

### 6. Additional Intelligence Tools ($0.05 USDC each)

* `get_top_picks`: Ranked candidate pairs clearing WFE efficiency score gates.
* `check_pair_directive`: Returns restriction state (`UNRESTRICTED`, `LONG_ONLY`, `SHORT_ONLY`, `BANNED`).
* `get_harvest_targets`: Returns Amber Band gap levels ($\lambda_{30}$, $\lambda_{50}$) for a symbol.
* `get_robust_island_status`: Evaluates whether a pair exhibits the champion SMA retest setup.
* `get_market_microstructure`: Raw spread, book depth walls, and delta volume.
* `get_alpha_bundle` ($0.15 USDC): Complete alpha package (regime, top picks, calendar) in one single batch call.

---

## 🛑 Standardized Error Taxonomy

All errors conform to JSON-RPC 2.0 error specifications:

| Code | Constant | Meaning & Required Action |
| :--- | :--- | :--- |
| `-32042` | `INSUFFICIENT_CREDITS` | Account balance depleted. Client must top up via `POST /x402/topup`. |
| `-32043` | `INVALID_SPEND_KEY` | Missing or invalid `x-spend-key`. Recover via `POST /x402/spend-key/rotate`. |
| `-32044` | `SESSION_IDENTITY_MISMATCH` | Request headers do not match the session creator. |
| `-32602` | `INVALID_PARAMS` | Input validation failed (e.g. malformed symbol or negative size). |
| `-32603` | `INTERNAL_ERROR` | Internal calculation failure. **Client must fail-closed.** |
| `-32050` | `STALE_ORACLE_FEED` | Real-time market feed latency $>15\text{s}$. Order must be aborted. |
