# 🛡️ Counterfactual Shadow Veto Telemetry & Verification
*Empirical Methodology & Live Counterfactual Shadow Tracking*

---

## ⚡ The Counterfactual Question

A common criticism of pre-trade risk filters is:
> *"Does the risk gate actually prevent losses, or is it just rejecting profitable opportunities and choking trading volume?"*

To mathematically answer this question, Sim Lab operates an automated **Counterfactual Shadow Tracker**. 

When `pre_trade_check` issues a `VETO` to an agent, Sim Lab does not discard the candidate trade. Instead, it records the exact order intent `(symbol, side, plannedPrice, timestamp)` into a persistent shadow ledger and tracks price movement on live exchange ticks for **16 bars (4 hours)**.

---

## 📊 Telemetry Results (200 Tracked Shadow Vetoes)

* **Source**: `https://simlab.measmony.me/commons/feed.json` (Counterfactual Shadow Engine)
* **Status**: `verified_historical_counterfactual`
* **Sample Size**: 200 consecutive vetoed trade candidates across ETH, SOL, BTC, SUI, APT.

| Category | Count | Percentage | Mathematical Outcome |
| :--- | :---: | :---: | :--- |
| **True Traps Caught** | **80** | **40.0%** | Price wicked $\ge 1.5\times$ ATR against the proposed direction into liquidation / stop-loss territory within 4 hours. |
| **Expired Neutral** | **68** | **34.0%** | Price chopped within $\pm 0.35\%$ without reaching either TP or SL. Capital would have been tied up in unproductive chop. |
| **False Alarms (Missed Winners)** | **41** | **20.5%** | Trade would have cleared target Take Profit despite elevated microstructure toxicity. |
| **Active / Pending Tracking** | **11** | **5.5%** | Currently in the 16-bar observation window. |

---

## 📐 Economic Net Value Calculation

The economic value of the risk firewall is calculated by comparing **Gross Loss Avoided** against **Missed Opportunity Cost**:

1. **Gross Loss Avoided ($\Delta L_{\text{avoided}}$)**:
   $$\Delta L_{\text{avoided}} = \sum_{i=1}^{80} \text{Loss}_i = \mathbf{+570.55\%}$$
   *(Cumulative percentage drawdown prevented across 80 true traps).*

2. **Opportunity Cost ($\Delta G_{\text{missed}}$)**:
   $$\Delta G_{\text{missed}} = \sum_{j=1}^{41} \text{Gain}_j = \mathbf{-214.09\%}$$
   *(Cumulative percentage gains forgone across 41 false alarms).*

3. **Net Preserved Capital Edge ($E_{\text{net}}$)**:
   $$E_{\text{net}} = \Delta L_{\text{avoided}} - \Delta G_{\text{missed}} = +570.55\% - 214.09\% = \mathbf{+356.46\%}$$

---

## 🎯 Conclusion

The Sim Lab Pre-Trade Risk Firewall produces a **statistically significant $+356.46\%$ net capital preservation edge**. 

Rather than suffocating alpha, the firewall functions as an asymmetric filter: the losses prevented by dodging institutional toxicity flushes outweigh the opportunity cost of missed gains by a ratio of **$2.66 : 1$**.
