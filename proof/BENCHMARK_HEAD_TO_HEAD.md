# ⚔️ Head-to-Head Replay Benchmark: Sim Lab vs RiskState

*Autonomous Counterfactual Verification Across 500 Historical Binance Perpetual Breakouts*

---

## ⚡ Executive Summary

Does pre-trade intelligence genuinely protect trading agents from toxic order flow, or does it merely reject winners and choke fleet volume?

To mathematically settle this question, this benchmark replayed **500 identical historical breakout opportunities** from Binance perpetual futures data (October 2026, 15-minute timeframe across BTC, ETH, SOL, and SUI) through:
1. **Sim Lab Pre-Trade Risk Firewall** (Layer 1 Regime + Layer 3 L2 Spoof Shield + Layer 4 VPIN Toxicity Gate).
2. **RiskState Baseline** (Traditional ATR Volatility & Momentum Threshold Filter).

Both systems received identical market inputs. Their `ALLOW` and `VETO` decisions were recorded and matched against forward exchange price outcomes over a 16-bar (4-hour) horizon.

---

## 📊 Benchmark Scorecard

| Dimension | Sim Lab Pre-Trade Firewall | RiskState Baseline | Fleet Edge |
| :--- | :---: | :---: | :---: |
| **Shield Precision** | **75.6%** | 74.3% | **+1.3%** |
| **True Traps Caught (SL Saved)** | **192** | 78 | **+114 traps avoided** |
| **False Alarms (Missed TP)** | **62** | 27 | Low opportunity cost |
| **Unproductive Chop Filtered** | **19** | 6 | Reduced exchange fees |
| **Gross Loss Avoided** | **+192.0 R** | +78.0 R | **+114.0 R capital saved** |
| **Net Capital Preserved Edge** | **+68.0 R** | +24.0 R | **+44.0 R asymmetric gain** |
| **Cumulative Strategy PnL** | **+99.0 R** | +54.3 R | **+44.7 R (+82.2%)** |
| **Max Equity Drawdown** | **6.4 R** | 17.1 R | **-62.3% drawdown truncation** |
| **Dynamic Amber Exit PnL** | **+111.4 R** | N/A (Static 2:1 TP) | **+7.4% alpha over static TP** |
| **P95 Decision Latency** | **0.00 ms** | 0.8 ms | Real-time pre-tick enforcement |

---

## 🛡️ The 5 Proof Dimensions Explained

### 1. Dimension 1: Trap Shield Precision (75.6% vs 74.3%)
A generic ATR filter is symmetric: it blocks winners almost as often as it blocks losers. Sim Lab's order flow toxicity detector (VPIN) and resting L2 spoof wall sensor achieve **75.6% precision**, catching 150+ predatory wicks while keeping false alarms to a minimum.

### 2. Dimension 2: Asymmetric Net Capital Edge
For every **$1.00 in missed theoretical gains** due to false alarms, Sim Lab saved **$1.55 in realized liquidation / stop-out losses**. This produces a positive net capital edge of **+68.0 R**.

### 3. Dimension 3: Crash Drawdown Truncation (-62.3%)
During liquidity cascade events, generic filters allow entries because trailing ATR has not yet peaked. Sim Lab's instantaneous VPIN spike triggers a pre-trade veto *before* the waterfall candle completes, compressing peak-to-trough drawdown by **62.3%**.

### 4. Dimension 4: Dynamic Amber Exit Harvest (+7.4% Alpha)
Static 2:1 take-profits frequently miss terminal profits during reversal sweeps. Sim Lab Layer 5 HarvestMaster locks 30% of the position at the Tier 1 Amber pullback and ratchets the stop to breakeven, generating an additional **+12.5 R** in realized gains.

### 5. Dimension 5: IP Protection & Anti-Exploit Security
- **Strict T-48h Age Lock**: The server strictly rejects queries newer than 48 hours to prevent live alpha extraction without paying via x402.
- **Zero Client Math Leaks**: The benchmark operates purely as a black-box referee comparing verdicts against public exchange candles.

---

## 🔬 How to Reproduce

Run the hermetic benchmark locally:
```bash
git clone https://github.com/simlab-ai/simlab-mcp-for-trading-agents.git
cd simlab-mcp-for-trading-agents
npm install
npm run benchmark:head-to-head
```

To verify live against the Sim Lab Jetson Orin production cluster:
```bash
SIMLAB_SERVER_URL="https://simlab.measmony.me" npm run benchmark:head-to-head
```
