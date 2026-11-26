"""
SimLab Adverse Selection & VPIN Toxicity Guard for Hummingbot
─────────────────────────────────────────────────────────────────────────────
Drop-in Risk Controller for Hummingbot Market-Making & Directional Bots.

Protects liquidity providers and market makers from getting run over by:
- Toxic Order Flow (VPIN >= 0.35 informed volume sweeps)
- L2 Order Book Spoof Walls & Cascade Liquidations
- Macro News Event Volatility Traps

How to use in Hummingbot:
1. Place this file in your Hummingbot installation under `scripts/` or `controllers/`.
2. In your Hummingbot custom script:
   ```python
   from scripts.hummingbot_simlab_guard import SimLabHummingbotGuard

   class SimLabMMStrategy(ScriptStrategyBase):
       markets = {"binance_perpetual": {"BTC-USDT"}}

       def __init__(self, connectors: Dict[str, ConnectorBase]):
           super().__init__(connectors)
           self.guard = SimLabHummingbotGuard(
               client_id="hummingbot-quant-desk",
               spend_key=""  # Optional: funded x402 spend key for institutional depth
           )

       def on_tick(self):
           # Query SimLab toxicity gate
           status = self.guard.check_toxicity("BTC-USDT")
           if status["is_toxic"]:
               self.logger().warning(f"⚠️ Toxic flow detected (VPIN: {status.get('vpin')}, Risk: {status.get('risk_band')}). Cancelling bids & widening spreads!")
               self.cancel_all_orders()
               return
           # Normal market making order placement continues...
   ```
"""

import json
import logging
import os
import time
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

SIMLAB_GATEWAY_URL = os.getenv("SIMLAB_MCP_URL", "https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp")


class SimLabHummingbotGuard:
    """Pre-Trade Adverse Selection Firewall for Hummingbot Market Makers."""

    def __init__(
        self,
        client_id: str = "hummingbot-autonomous-bot",
        spend_key: str = "",
        gateway_url: str = SIMLAB_GATEWAY_URL,
        vpin_threshold: float = 0.35,
        timeout_seconds: float = 2.0,
        fail_open: bool = True
    ):
        self.client_id = client_id
        self.spend_key = spend_key
        self.gateway_url = gateway_url
        self.vpin_threshold = vpin_threshold
        self.timeout = timeout_seconds
        self.fail_open = fail_open

        # Cache check results for 5 seconds to avoid spamming on high-frequency ticks
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = 5.0

    def _call_mcp(self, tool_name: str, arguments: dict) -> Dict[str, Any]:
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments}
        }
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "hummingbot-simlab-agent/1.0",
            "x-client-id": self.client_id
        }
        if self.spend_key:
            headers["x-spend-key"] = self.spend_key

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(self.gateway_url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                if "result" in res and "content" in res["result"]:
                    for item in res["result"]["content"]:
                        if item.get("type") == "text":
                            try:
                                return {"ok": True, "data": json.loads(item["text"])}
                            except json.JSONDecodeError:
                                return {"ok": True, "raw": item["text"]}
                return {"ok": True, "result": res.get("result", {})}

        except urllib.error.HTTPError as e:
            if e.code == 402:
                # x402 Micropayment required - parse teaser details
                try:
                    err_body = json.loads(e.read().decode("utf-8"))
                    teaser = err_body.get("error", {}).get("data", {}).get("teaser", {})
                    return {
                        "ok": False,
                        "status": 402,
                        "teaser": teaser,
                        "priceAtomic": err_body.get("error", {}).get("data", {}).get("priceAtomic", 150000),
                        "topup": err_body.get("error", {}).get("data", {}).get("topup", "")
                    }
                except Exception:
                    return {"ok": False, "status": 402}
            logger.debug(f"[SimLab Guard] HTTP {e.code}: {e.reason}")
            return {"ok": False, "status": e.code}

        except Exception as e:
            logger.debug(f"[SimLab Guard] Remote query error: {e}")
            return {"ok": False, "error": str(e)}

    def check_toxicity(self, trading_pair: str, side: str = "BUY") -> Dict[str, Any]:
        """
        Evaluate order flow toxicity before placing or updating quotes.
        Returns a dict: {"is_toxic": bool, "vpin": float, "risk_band": str, "spread_multiplier": float}
        """
        normalized_pair = trading_pair.replace("-", "/").replace("_", "/")
        symbol = normalized_pair.split("/")[0]
        now = time.time()

        if normalized_pair in self._cache:
            entry = self._cache[normalized_pair]
            if now - entry["timestamp"] < self._cache_ttl:
                return entry["result"]

        # Call SimLab deterministic risk gate
        res = self._call_mcp("pre_trade_check", {
            "symbol": symbol,
            "side": side.upper()
        })

        if res.get("ok"):
            # Funded / free execution
            check_data = res.get("data", {})
            decision = check_data.get("decision", check_data.get("verdict", "PASS"))
            vpin = float(check_data.get("vpin", check_data.get("toxicity", 0.0)))
            is_toxic = decision in ("VETO", "BLOCK", "REJECT") or vpin >= self.vpin_threshold
            risk_band = check_data.get("riskBand", "LOW" if not is_toxic else "ELEVATED")
            spread_mult = 2.5 if is_toxic else 1.0

            result = {
                "is_toxic": is_toxic,
                "vpin": vpin,
                "risk_band": risk_band,
                "decision": decision,
                "spread_multiplier": spread_mult,
                "tier": "PAID_VERIFIED"
            }
        elif res.get("status") == 402:
            # Free teaser tier (analyzed by SimLab engine)
            teaser = res.get("teaser", {})
            risk_band = teaser.get("riskBand", "ELEVATED")
            is_toxic = risk_band in ("HIGH", "CRITICAL")
            spread_mult = 2.0 if is_toxic else 1.0

            result = {
                "is_toxic": is_toxic,
                "vpin": 0.40 if is_toxic else 0.20,
                "risk_band": risk_band,
                "decision": "WARN_HIGH_RISK" if is_toxic else "PASS_TEASER",
                "spread_multiplier": spread_mult,
                "tier": "TEASER_EVALUATION",
                "notice": "Unfunded caller. Top-up Base USDC to unlock full sub-second veto logs."
            }
        else:
            # Offline fallback (fail-open)
            result = {
                "is_toxic": False,
                "vpin": 0.0,
                "risk_band": "UNKNOWN",
                "decision": "PASS",
                "spread_multiplier": 1.0,
                "tier": "FAIL_OPEN"
            }

        self._cache[normalized_pair] = {"timestamp": now, "result": result}
        return result


if __name__ == "__main__":
    print("Testing SimLabHummingbotGuard against live gateway...")
    guard = SimLabHummingbotGuard(client_id="hummingbot-quant-bot")
    res = guard.check_toxicity("BTC-USDT", side="BUY")
    print(f"Result for BTC-USDT: {json.dumps(res, indent=2)}")
