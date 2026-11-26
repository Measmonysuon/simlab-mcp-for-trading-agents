"""
SimLab Pre-Trade Veto Guard for Freqtrade
─────────────────────────────────────────────────────────────────────────────
Drop-in Risk Interceptor for Freqtrade Python Trading Bots.

Plugs directly into Freqtrade's `confirm_trade_entry()` callback:
- Queries SimLab Alpha Intelligence MCP before any order touches an exchange.
- Intercepts toxic microstructure (VPIN >= 0.35, orderbook spoof walls, wick traps).
- Fail-safe: Returns True (passes order) if SimLab is unreachable so trading is never blocked.
- Uses standard library urllib (zero additional pip dependencies needed).

Installation for Freqtrade:
1. Copy this file into your `user_data/strategies/` directory alongside your strategy.
2. In your strategy file:
   from freqtrade.strategy import IStrategy
   from user_data.strategies.freqtrade_simlab_guard import SimLabTradeGuard

   class MyStrategy(IStrategy):
       def __init__(self, config: dict) -> None:
           super().__init__(config)
           self.simlab_guard = SimLabTradeGuard(
               client_id="freqtrade-bot-01",
               spend_key=""  # Optional: Set your $1 top-up spend key for full veto protection
           )

       def confirm_trade_entry(self, pair: str, order_type: str, amount: float, rate: float,
                               time_in_force: str, current_time, entry_tag: str, side: str, **kwargs) -> bool:
           # Query SimLab pre-trade veto gate (< 15ms)
           allowed = self.simlab_guard.confirm_entry(
               pair=pair,
               side=side.upper(),  # "LONG" or "SHORT"
               entry_price=rate,
               size_usd=amount * rate,
               leverage=self.leverage.value if hasattr(self, 'leverage') else 1
           )
           if not allowed:
               logger.warning(f"🛡️ [SIMLAB VETO] Entry blocked for {side} {pair} @ {rate}")
               return False
           return True
"""

import json
import logging
import os
import time
import urllib.request
import urllib.error
from typing import Optional

logger = logging.getLogger(__name__)

SIMLAB_GATEWAY_URL = os.getenv("SIMLAB_MCP_URL", "https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp")


class SimLabTradeGuard:
    """Institutional Pre-Trade Risk Firewall for Freqtrade."""

    def __init__(
        self,
        client_id: str = "freqtrade-autonomous-bot",
        spend_key: str = "",
        gateway_url: str = SIMLAB_GATEWAY_URL,
        timeout_seconds: float = 2.0,
        fail_open: bool = True
    ):
        self.client_id = client_id
        self.spend_key = spend_key
        self.gateway_url = gateway_url
        self.timeout = timeout_seconds
        self.fail_open = fail_open  # If SimLab times out, allow order (do not stall bot)

        # In-memory regime cache (throttle regime queries to 1 per 60s)
        self._regime_cache: Optional[dict] = None
        self._regime_cache_time: float = 0.0

    def _call_mcp(self, tool_name: str, arguments: dict) -> Optional[dict]:
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments}
        }
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "python-httpx/0.28.1",
            "x-client-id": self.client_id
        }
        if self.spend_key:
            headers["x-spend-key"] = self.spend_key

        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(self.gateway_url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8")
                res = json.loads(body)
                if "result" in res and "content" in res["result"]:
                    for item in res["result"]["content"]:
                        if item.get("type") == "text":
                            try:
                                return json.loads(item["text"])
                            except Exception:
                                return {"raw": item["text"]}
                return res
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8")
            try:
                err_json = json.loads(raw)
                return err_json
            except Exception:
                return None
        except Exception as err:
            logger.debug(f"[SimLab Guard] Gateway request error: {err}")
            return None

    def get_market_regime(self) -> dict:
        """Queries SimLab free macro regime filter (cached 60 seconds)."""
        now = time.time()
        if self._regime_cache and (now - self._regime_cache_time < 60):
            return self._regime_cache

        res = self._call_mcp("get_market_regime", {})
        if res and isinstance(res, dict) and "headlineRegime" in res:
            self._regime_cache = res
            self._regime_cache_time = now
            return res
        return self._regime_cache or {}

    def confirm_entry(
        self,
        pair: str,
        side: str,
        entry_price: float,
        size_usd: float = 1000.0,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        leverage: int = 1
    ) -> bool:
        """
        Evaluates the prospective order against SimLab institutional trap shield.
        Returns True to execute trade, False to VETO and abort.
        """
        # Format pair (e.g. BTC/USDT:USDT -> BTC/USD)
        clean_pair = pair.split(":")[0].replace("/USDT", "/USD").replace("/USDC", "/USD")

        # 1. Quick Macro Regime Check (Directional ban or Macro lock)
        regime = self.get_market_regime()
        if regime:
            banned_dirs = regime.get("bannedDirections", [])
            if side in banned_dirs:
                logger.info(f"🚫 [SIMLAB REGIME BAN] Macro regime {regime.get('headlineRegime')} bans {side} orders.")
                return False

        # 2. Institutional Pre-Trade Microstructure Gate
        req_payload = {
            "symbol": clean_pair,
            "action": side.upper(),
            "entryPrice": entry_price,
            "sizeUsd": size_usd,
            "leverage": leverage
        }
        if stop_loss:
            req_payload["stopLoss"] = stop_loss
        if take_profit:
            req_payload["takeProfit"] = take_profit

        verdict = self._call_mcp("pre_trade_check", req_payload)

        # Handle unfunded teaser receipts gracefully
        if verdict and "error" in verdict and verdict["error"].get("code") == -32042:
            teaser = verdict["error"].get("data", {}).get("teaser", {})
            risk_band = teaser.get("riskBand", "MODERATE")
            if risk_band == "HIGH":
                logger.warning(f"⚠️ [SIMLAB TEASER ALERT] Setup flagged as HIGH RISK by fleet shield.")
            return True  # If only on free teaser tier, fail-open to not block bot

        if not verdict:
            return self.fail_open

        # Evaluate verdict
        if isinstance(verdict, dict):
            # Check passed flag
            if "passed" in verdict:
                if not verdict["passed"]:
                    reasons = verdict.get("reasons", verdict.get("failedChecks", []))
                    logger.warning(f"🛡️ [SIMLAB VETO] {clean_pair} {side} blocked: {reasons}")
                    return False
                return True

            if verdict.get("verdict") == "VETO":
                logger.warning(f"🛡️ [SIMLAB VETO] Intercepted {clean_pair} {side}: {verdict.get('reason')}")
                return False

        return True
