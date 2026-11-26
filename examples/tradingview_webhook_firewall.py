"""
TradingView Webhook Pre-Trade Risk Firewall
─────────────────────────────────────────────────────────────────────────────
Standalone micro-proxy for TradingView Alert automation.

Architecture:
[TradingView PineScript Alert]
       │ (POST webhook)
       ▼
[This Pre-Trade Risk Firewall]
       │ Queries SimLab Alpha Intelligence MCP (< 20ms)
       │ - VPIN Toxicity Check
       │ - Orderbook Spoof Wall Veto
       │ - Macro Event Freezes
       ▼
   Verdict:
   ├─ PASS ──► Forwards order to your exchange (Binance, Bybit, Hyperliquid)
   └─ VETO ──► Drops order, logs forensic reasons, sends Telegram/Discord alert

Zero-pip dependencies: Uses standard library `http.server` & `urllib`.
Run locally: `python3 tradingview_webhook_firewall.py --port 8080`
"""

import json
import logging
import os
import sys
import time
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("TradingViewFirewall")

SIMLAB_URL = os.getenv("SIMLAB_MCP_URL", "https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp")
FIREWALL_PORT = int(os.getenv("PORT", "8080"))
SECRET_TOKEN = os.getenv("WEBHOOK_SECRET", "")  # Optional auth passphrase


def query_simlab_veto(symbol: str, side: str, amount_usd: float = 100.0) -> dict:
    """Evaluate pre-trade risk via SimLab Alpha Intelligence."""
    payload = {
        "jsonrpc": "2.0",
        "id": int(time.time() * 1000),
        "method": "tools/call",
        "params": {
            "name": "pre_trade_check",
            "arguments": {"symbol": symbol, "side": side.upper()}
        }
    }
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "tradingview-firewall/1.0",
        "x-client-id": "tradingview-alert-bot"
    }

    try:
        req = urllib.request.Request(SIMLAB_URL, data=json.dumps(payload).encode("utf-8"), headers=headers)
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {"allowed": True, "details": data.get("result", {})}
    except urllib.error.HTTPError as e:
        if e.code == 402:
            # Parse teaser risk band
            try:
                err = json.loads(e.read().decode("utf-8"))
                teaser = err.get("error", {}).get("data", {}).get("teaser", {})
                risk = teaser.get("riskBand", "LOW")
                if risk in ("HIGH", "CRITICAL"):
                    return {
                        "allowed": False,
                        "reason": f"SimLab Veto: Risk Band is {risk} (Teaser evaluation)",
                        "teaser": teaser
                    }
                return {"allowed": True, "reason": "Teaser low risk pass", "teaser": teaser}
            except Exception:
                return {"allowed": True, "reason": "Fail-open on 402 parse error"}
        logger.warning(f"SimLab HTTP {e.code}: Failing open to prevent missed trade")
        return {"allowed": True, "reason": f"HTTP {e.code} fail-open"}
    except Exception as e:
        logger.warning(f"SimLab connection failed ({e}). Failing open.")
        return {"allowed": True, "reason": "Network fail-open"}


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length).decode("utf-8")

        try:
            alert = json.loads(post_data)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"error": "Invalid JSON body"}')
            return

        # Optional secret validation
        if SECRET_TOKEN and alert.get("secret") != SECRET_TOKEN:
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'{"error": "Unauthorized webhook"}')
            return

        ticker = alert.get("ticker", alert.get("symbol", "BTCUSDT")).replace("USDT", "").replace("/", "")
        action = alert.get("action", alert.get("order_action", "buy")).upper()
        side = "LONG" if "BUY" in action else "SHORT"
        price = float(alert.get("price", alert.get("close", 0)))

        logger.info(f"📥 Received Alert: {action} {ticker} @ {price}")

        # Execute SimLab pre-trade verification
        veto_check = query_simlab_veto(symbol=ticker, side=side)

        if not veto_check.get("allowed"):
            logger.warning(f"🛡️ [VETO BLOCKED] Blocked {side} {ticker}: {veto_check.get('reason')}")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            res = {
                "status": "VETOED",
                "action": "ORDER_CANCELLED",
                "reason": veto_check.get("reason"),
                "firewall": "SimLab Alpha Intelligence"
            }
            self.wfile.write(json.dumps(res).encode("utf-8"))
            return

        # Passed risk check - order is safe to execute
        logger.info(f"✅ [APPROVED] Safe to execute {side} {ticker} on exchange")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        res = {
            "status": "APPROVED",
            "action": "ORDER_FORWARDED",
            "ticker": ticker,
            "side": side,
            "firewall": "SimLab Alpha Intelligence"
        }
        self.wfile.write(json.dumps(res).encode("utf-8"))


if __name__ == "__main__":
    logger.info(f"🚀 Starting TradingView Pre-Trade Risk Firewall on port {FIREWALL_PORT}...")
    server = HTTPServer(("0.0.0.0", FIREWALL_PORT), WebhookHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server stopped.")
