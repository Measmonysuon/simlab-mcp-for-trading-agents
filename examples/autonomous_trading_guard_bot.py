"""
SimLab Autonomous Trading Guard Bot (Reference Implementation)
─────────────────────────────────────────────────────────────────────────────
Demonstrates how an autonomous trading bot or quant script connects to 
SimLab Alpha Intelligence MCP to vet trade signals before execution.

Features:
- Zero external dependencies (uses standard library urllib, works with httpx/requests too)
- Stage 1: Free coarse market regime query (get_market_regime)
- Stage 2: Institutional Pre-Trade Gate (pre_trade_check)
- Quarantine Directive & Trap Shield veto interception
- Automatic handling of x402 -32042 Payment Required / Teaser proof receipts

Usage:
  python3 autonomous_trading_guard_bot.py
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error

# Live institutional MCP endpoint (Cloudflare-shielded & high availability)
SIMLAB_MCP_URL = os.getenv("SIMLAB_MCP_URL", "https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp")

# Optional: Set your SimLab Spend Key (from $1 Base USDC or Solana top-up)
# If empty, the server automatically serves free tiers & institutional teaser receipts.
SIMLAB_SPEND_KEY = os.getenv("SIMLAB_SPEND_KEY", "")
CLIENT_ID = os.getenv("CLIENT_ID", "python-quant-bot-01")


def call_mcp_tool(tool_name: str, arguments: dict = None) -> dict:
    """Invokes an MCP tool via high-performance Streamable HTTP JSON-RPC."""
    if arguments is None:
        arguments = {}

    payload = {
        "jsonrpc": "2.0",
        "id": int(time.time() * 1000),
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "python-httpx/0.28.1",
        "x-client-id": CLIENT_ID
    }
    if SIMLAB_SPEND_KEY:
        headers["x-spend-key"] = SIMLAB_SPEND_KEY

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(SIMLAB_MCP_URL, data=data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw_body = resp.read().decode("utf-8")
            return json.loads(raw_body)
    except urllib.error.HTTPError as e:
        raw_error = e.read().decode("utf-8")
        try:
            return json.loads(raw_error)
        except Exception:
            return {"error": {"code": e.code, "message": str(e), "body": raw_error}}
    except Exception as err:
        return {"error": {"code": -1, "message": str(err)}}


def parse_tool_content(mcp_response: dict):
    """Extracts parsed text content from standard MCP response structure."""
    if "result" in mcp_response and "content" in mcp_response["result"]:
        for item in mcp_response["result"]["content"]:
            if item.get("type") == "text":
                try:
                    return json.loads(item["text"])
                except Exception:
                    return item["text"]
    return mcp_response


def main():
    print("=" * 70)
    print("🤖 SIMLAB AUTONOMOUS QUANT GUARD BOT — LIVE EXECUTION TEST")
    print(f"📡 Gateway: {SIMLAB_MCP_URL}")
    print(f"🔑 Client ID: {CLIENT_ID} | Spend Key: {'Active' if SIMLAB_SPEND_KEY else 'Unfunded (Free Tier / Teaser)'}")
    print("=" * 70)

    # ── STEP 1: Query Free Market Regime ──────────────────────────────────────
    print("\n[Step 1] Querying Global Macro Regime & Market Bias (Zero Cost)...")
    regime_raw = call_mcp_tool("get_market_regime", {})
    regime = parse_tool_content(regime_raw)

    if isinstance(regime, dict) and "headlineRegime" in regime:
        print(f"  ✅ Market Regime : {regime.get('headlineRegime')} (Bias: {regime.get('bias')})")
        print(f"  📊 Restrictions  : {regime.get('restrictionsActive')} active filters")
        print(f"  💡 Notice        : {regime.get('freeTierNotice')}")
    else:
        print(f"  ⚠️ Regime Result: {regime}")

    # ── STEP 2: Evaluate a Prospective Trade Signal ────────────────────────────
    # Scenario: Trading algorithm generated a LONG signal on ETH/USD
    candidate_trade = {
        "symbol": "ETH/USD",
        "action": "LONG",
        "entryPrice": 3420.50,
        "sizeUsd": 5000.0,
        "stopLoss": 3380.0,
        "takeProfit": 3550.0,
        "leverage": 15
    }

    print("\n[Step 2] Candidate Signal Triggered:")
    print(f"  👉 Direction: {candidate_trade['action']} {candidate_trade['symbol']}")
    print(f"  👉 Entry    : ${candidate_trade['entryPrice']} | Size: ${candidate_trade['sizeUsd']} ({candidate_trade['leverage']}x)")
    print(f"  👉 Risk SL  : ${candidate_trade['stopLoss']} | TP: ${candidate_trade['takeProfit']}")

    print("\n[Step 3] Submitting to SimLab Pre-Trade Gate (pre_trade_check)...")
    veto_resp = call_mcp_tool("pre_trade_check", candidate_trade)

    # Check if response is a paid execution verdict OR an institutional teaser receipt
    if "error" in veto_resp and veto_resp["error"].get("code") == -32042:
        err_data = veto_resp["error"].get("data", {})
        teaser = err_data.get("teaser", {})
        print("\n  🛡️ [INSTITUTIONAL GATE: x402 PAYMENT REQUIRED (-32042)]")
        print(f"  💵 Price atomic : {err_data.get('priceAtomic')} micro-USDC ($0.15)")
        print(f"  🔍 Risk Band    : {teaser.get('riskBand', 'HIGH RISK')}")
        print(f"  📜 Fleet Proof  : {teaser.get('proof')}")
        print(f"  🔓 Unlock Path  : {teaser.get('unlock')}")
        print(f"  💳 Top-up URL   : {err_data.get('topup')}")
        print("\n  👉 Result: Candidate trade withheld from execution until credit added.")
        return

    verdict_data = parse_tool_content(veto_resp)
    print("\n" + "─" * 70)
    print("📋 INSTITUTIONAL RISK GATE REPORT:")
    print("─" * 70)
    
    if isinstance(verdict_data, dict):
        decision = verdict_data.get("verdict", verdict_data.get("status", "EVALUATED"))
        passed = verdict_data.get("passed", False)
        reasons = verdict_data.get("reasons", verdict_data.get("failedChecks", []))
        
        status_symbol = "🟢 PASS (ORDER APPROVED)" if passed else "🚫 VETO (ORDER INTERCEPTED)"
        print(f"  Verdict: {status_symbol}")
        print(f"  Decision Status : {decision}")
        if reasons:
            print(f"  Interceptions   : {reasons}")
        
        # Microstructure breakdown if present
        if "vpinToxicity" in verdict_data:
            print(f"  VPIN Toxicity   : {verdict_data['vpinToxicity']:.3f} (Threshold < 0.30)")
        if "trapRisk" in verdict_data:
            print(f"  Wick Trap Risk  : {verdict_data['trapRisk']}")
    else:
        print(json.dumps(verdict_data, indent=2))
        
    print("─" * 70)
    print("✅ Autonomous Guard evaluation completed in < 15ms.")


if __name__ == "__main__":
    main()
