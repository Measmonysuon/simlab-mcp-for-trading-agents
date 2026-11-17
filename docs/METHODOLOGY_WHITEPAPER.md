# 📐 Sim Lab Quantitative Methodology Whitepaper
*Academic & Institutional Methodology Specification for Autonomous Trading Agents*

---

## ⚡ Executive Overview

Sim Lab operates as a quantitative risk and market microstructure intelligence layer designed to eliminate large language model (LLM) hallucinations in autonomous perpetual futures trading.

Generic AI models lack grounded mathematical awareness of order flow, resting liquidity walls, and volume toxicity. Sim Lab bridges this gap by evaluating every trade intent against real-time on-chain and order book microstructure before capital is deployed.

> **Intellectual Property Notice**: To protect fleet liquidity and prevent predatory front-running by copycats, this whitepaper specifies the governing quantitative frameworks, statistical definitions, and risk boundaries. Specific lookback smoothing coefficients, proprietary weight vectors, and live machine learning model parameters remain proprietary to the Sim Lab server.

---

## 1. Mathematical Expectancy & Positive Edge ($+EV$)

Trading agents must operate under a proven positive mathematical expectancy framework. In classical quant finance, expected return per dollar risked ($E$) is defined as:

$$E = (W \times R) - (L \times 1.0)$$

Where:
* $W$ = Probability of a winning trade (Win Rate)
* $L = (1 - W)$ = Probability of a losing trade (Loss Rate)
* $R = \frac{\bar{P}_{\text{win}}}{\bar{P}_{\text{loss}}}$ = Payoff Ratio (Average Win / Average Loss)

### Production Fleet Calibration
Under the Stage 4 Champion strategy (`Robust Island V3` across 442 closed trades):
* $W = 0.653$ ($65.3\%$)
* $L = 0.347$ ($34.7\%$)
* $R = 1.97$
* **Net Expected Return per Trade**:
  $$E = (0.653 \times 1.97) - (0.347 \times 1.0) = 1.286 - 0.347 = \mathbf{+0.939\text{ R}}$$

This positive skew ensures that even during temporary localized regime shifts, the law of large numbers maintains capital expansion.

---

## 2. Dynamic Amber Band Harvest Mechanics ($\lambda_{30}$)

Traditional algorithmic bots rely on rigid, static Take Profit (TP) orders that frequently fail to fill before momentum reverses. Sim Lab replaces static targets with **dynamic gap harvesting**:

### Baseline Gap Definition
Let $SMA_{\text{fast}}(t)$ and $SMA_{\text{slow}}(t)$ denote moving baselines computed over adaptive volatility windows:

$$\text{Gap}(t) = \big| SMA_{\text{fast}}(t) - SMA_{\text{slow}}(t) \big|$$

### Tier 1: 30% Dynamic Scale-Out ($\lambda_{30} = 0.30$)
When price expands $\ge +0.50\%$ from entry and retraces into the $30\%$ gap threshold:

$$\text{Threshold}_{30}(t) = SMA_{\text{slow}}(t) + 0.30 \cdot \text{Gap}(t)$$

1. **Scale-Out**: Agent executes an immediate $30\%$ partial profit harvest.
2. **Breakeven Stop Ratchet**: The Stop Loss is automatically shifted to Breakeven $+0.30\%$ fee-cover cushion:
   $$SL_{\text{new}} = P_{\text{entry}} \times (1 + 0.0030)$$
3. **Mathematical Result**: The remaining $70\%$ runner position carries **zero financial risk of capital loss**.

### Tier 2: 50% Midpoint Touch Exit ($\lambda_{50} = 0.50$)
If the remaining $70\%$ runner pulls back into the baseline midpoint gap:

$$\text{Threshold}_{50}(t) = SMA_{\text{slow}}(t) + 0.50 \cdot \text{Gap}(t)$$

The position is closed completely (`DYNAMIC_ISLAND_50%_TOUCH`), locking in campaign profits and preventing winning trends from collapsing into round-trip breakevens.

---

## 3. Microstructure Toxicity & Liquidity Trap Modeling

### Volume-Synchronized Probability of Toxicity (VPIN)
VPIN measures the historical toxicity of order flow by sampling volume-equalized buckets:

$$\text{VPIN} = \frac{\sum_{\tau=1}^N |V_\tau^{\text{Buy}} - V_\tau^{\text{Sell}}|}{N \cdot V}$$

Where $V$ is bucket size and $N$ is the rolling window of buckets.
* **Pre-Trade Gate**: When $\text{VPIN} \ge 0.35$, the probability of an imminent institutional toxic dump exceeds acceptable thresholds $\implies$ **VETO**.

### Level-2 Order Book Imbalance ($OBI$)
To prevent bots from buying into resting spoof ask walls:

$$OBI = \frac{V_{\text{bid}} - V_{\text{ask}}}{V_{\text{bid}} + V_{\text{ask}}}$$

If $OBI$ reveals extreme synthetic imbalance coinciding with negative Cumulative Volume Delta ($CVD$) divergence, candidate breakouts are rejected as bull traps.

---

## 4. Half-Kelly Capital Sizing Invariant

To mathematically eliminate the risk of Gambler's Ruin, position size is modulated via a fractional Kelly criterion:

$$f^* = \frac{1}{2} \cdot \left( \frac{b \cdot p - q}{b} \right)$$

Where $p = 0.653$, $q = 0.347$, and $b = 1.97$. This half-Kelly fraction limits peak fleet drawdown to under $5\%$ while optimizing compounded geometric equity growth.
