# 📊 Sim Lab Fleet Performance Audit & Ablation Study
*Last Verified: 2026-11-15 | Data Source: Live Multi-Desk Telemetry (Aptos / Decibel / Arbitrum)*

---

## ⚡ Executive Summary

Sim Lab's quantitative intelligence is not a theoretical backtest. It was forged in live production across a multi-desk fleet of autonomous perpetual futures trading agents.

To provide complete institutional transparency, this audit is structured into two distinct walk-forward periods:
1. **The Production Champion Benchmark (Trades 629 – 1,070 / 442 Closed Trades)**: Performance under the current, frozen **Robust Island V3 + Sim Lab Risk Firewall** architecture.
2. **The R&D Ablation Study (Trades 1 – 628)**: Analysis of early exploratory trading without the risk firewall, proving why unshielded trading bots suffer structural drawdowns and how the **6 Institutional Invariants** permanently eliminated them.

---

## 🏆 Part 1: Production Champion Benchmark (Primary Record)

* **Architecture**: `Robust Island SMA Retest & 30% Dynamic Harvest Champion V3`
* **Risk Engine**: `Sim Lab Pre-Trade Risk Firewall (4-Shield Veto Gate)`
* **Execution Venue**: Decibel DEX (Aptos) & Hyperliquid
* **Sample Size**: **442 consecutive closed trades**
* **Verification Status**: Stage 4 Live Production Champion

### Key Performance Indicators (KPIs)

| Metric | Audited Value | Calculation Methodology |
| :--- | :---: | :--- |
| **Total Closed Trades** | **442** | Complete round-trip closed positions |
| **Win Rate ($W$)** | **65.3%** | $\frac{\text{Winning Trades}}{\text{Total Trades}} = \frac{289}{442}$ |
| **Profit Factor ($PF$)** | **3.71** | $\frac{\text{Gross Realized Profits}}{\text{Gross Realized Losses}} = \frac{\$14,840.12}{\$3,999.88}$ |
| **Average Win / Loss Ratio ($R$)** | **1.97 : 1** | Average profit per winner vs. average loss per loser |
| **Net Expected Value ($E$)** | **+0.939 R** | $E = (0.653 \times 1.97) - (0.347 \times 1.0)$ per trade |
| **Liquidations** | **0** | Strict 1.5x ATR dynamic stop loss + hard disaster stop |
| **Asset Universe** | **ETH, SOL** (Tier 1) | High-liquidity perp pairs clearing WFE score gate |

### Audited Fee & Slippage Model
All figures cited above are **strictly net of real-world friction**:
* **Exchange Taker / Maker Fees**: 100% of entries utilize **PostOnly Maker orders (`TIF=1`)** with **0.00% maker fee** (or negative rebate where available).
* **Taker Exits (Emergency / Trailing)**: Deducted at **0.05%** per volume.
* **Conservative Slippage Deduction**: Simulated at **0.02%** on all dynamic scale-outs.
* **Funding Rate Carry**: Tracked dynamically; positions are vetoed if negative carry exceeds $+0.08\%$ per 8-hour epoch.

---

## 🔬 Part 2: The R&D Ablation Study (Why Unshielded Bots Lose)

In machine learning and quant research, an **Ablation Study** demonstrates what happens when critical safety components are removed. 

Before deploying the Robust Island Champion and the Sim Lab Pre-Trade Firewall, early fleet iterations (Trades 1 – 628) experienced significant drawdowns during exploratory testing. Rather than hiding these early cycles, we document the exact structural failure modes discovered and the permanent invariant implemented to fix each.

### The 4 Major Failure Modes Discovered During R&D

| Failure Mode in Early Fleet | Structural Problem | The Permanent Sim Lab Fix |
| :--- | :--- | :--- |
| **1. Taker Fee Drag** | Market orders ate **40%–60% of net profits** during high-frequency chop. | **Pillar 1 Invariant**: Mandatory PostOnly (`TIF=1`). Taker fallback completely blocked in execution engine. |
| **2. Rigid Blanket Bans** | Hardcoding `bannedSide: 'SHORT'` during macro crises prevented bots from capturing trend drops when 17/18 pairs dumped. | **Pillar 5 Invariant (CIO Discretion)**: Eliminated blanket bans. Replaced with real-time Expected Value ($+EV$) and L2 absorption evaluation on both sides. |
| **3. Premature Breakeven Stop Hunts** | Ratcheting Stop Loss to Breakeven too early caused trades to get wicked out before the big expansion. | **Pillar 2 Invariant**: Prohibits breakeven ratcheting before $\ge 1.75\text{R}$ or $\ge 2.2\times\text{ATR}$ confirmed structural clearance. |
| **4. Institutional Trap Flushes** | Entering breakout signals right as whales dumped into retail liquidity. | **Pillar 3 & Layer 4 (Pre-Trade Veto)**: Real-time VPIN ($\ge 0.35$) and CVD divergence checks blocking toxic entries. |

### Comparative Performance: Before vs. After Firewall Deployment

```
Early Exploratory Phase (Trades 1–628)         Robust Island Champion (Trades 629–1070)
[High Taker Drag · Unshielded Traps]    ──►   [100% Maker · Dynamic Harvest · Pre-Trade Veto]
Win Rate: ~38.4%                              Win Rate: 65.3%
Profit Factor: 0.82 (Drawdown Phase)          Profit Factor: 3.71 (Production Stage 4)
Max Drawdown: -18.4%                          Max Drawdown: -4.1%
```

> **Takeaway for Integrators**: Unshielded autonomous agents face the exact failure modes seen in our early R&D. Querying the Sim Lab MCP server allows agents to immediately bypass this multi-month learning curve and execute with verified production-grade protection.

---

## 🛡️ Part 3: Counterfactual Shadow Veto Edge

Does the pre-trade risk gate sacrifice profitable trades? To find out, the fleet runs a continuous **Counterfactual Shadow Tracker** that simulates every vetoed trade for 16 bars (4 hours) on live exchange ticks:

* **Total Shadow Vetoes Tracked**: 200
* **True Traps Caught**: 80 (Trades that wicked $\ge 1.5\times$ ATR into liquidation territory)
* **False Alarms (Missed Winners)**: 41
* **Expired Neutral**: 68
* **Shield Precision**: **66.1%**
* **Gross Losses Avoided**: **+570.55%**
* **Opportunity Cost of Missed Gains**: **-214.09%**
* **Net Preserved Capital Edge**: **+356.46%**

---

## 📄 Data Availability & Verifiable Telemetry

* **Live Telemetry Feed**: Published continuously at `GET https://simlab.measmony.me/commons/feed.json`.
* **Anonymized Sample Ledger**: Representative trade records are provided in [proof/trades.sample.json](trades.sample.json).
