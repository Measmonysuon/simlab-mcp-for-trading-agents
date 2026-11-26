# Connecting SimLab MCP to Claude Desktop, Cursor & Python Trading Bots in 60 Seconds

> **SimLab Trading Desk MCP** provides autonomous AI agents, quant algorithms, and IDE copilots with institutional pre-trade risk gates, orderflow toxicity filters (VPIN), liquidation trap shields, and real-time market regime alpha.

---

## ⚡ Live MCP Gateways

| Transport | Endpoint URL | Recommended For |
| :--- | :--- | :--- |
| **Streamable HTTP (Fastest)** | `https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp` | Claude Desktop, Cursor, Python Quants, LLM APIs |
| **Direct Alpha Gateway** | `https://alpha.measmony.me/mcp` | Dedicated institutional high-throughput setups |
| **Remote SSE Stream** | `https://simlab.measmony.me/mcp/sse` | Legacy persistent EventSource clients |

---

## 1. Claude Desktop (Mac & Windows) — 60 Seconds

Add SimLab directly to your Claude Desktop configuration file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "simlab-trading-desk": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@latest",
        "https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp"
      ]
    }
  }
}
```

> **Restart Claude Desktop.** You will see 16 institutional trading tools active in Claude's hammer (🛠️) menu.

---

## 2. Cursor IDE — 60 Seconds

Connect SimLab to Cursor's AI Composer to vet trading logic directly inside your codebase:

1. Open **Cursor Settings** (`Cmd + ,` or `Ctrl + ,`).
2. Navigate to **Features** ➔ **MCP Servers** ➔ Click **+ Add New MCP Server**.
3. Fill in the fields:
   - **Name:** `simlab`
   - **Type:** `command`
   - **Command:** `npx -y mcp-remote@latest https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp`
4. Click **Save**.

*Alternatively, add it to your project root in `.cursor/mcp.json`:*
```json
{
  "mcpServers": {
    "simlab": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp"]
    }
  }
}
```

---

## 3. Windsurf, Cline & Continue.dev — 60 Seconds

In your MCP settings (e.g. `~/.codeium/windsurf/mcp_config.json` or Cline MCP settings):

```json
{
  "mcpServers": {
    "simlab": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp"]
    }
  }
}
```

---

## 4. Python Trading Bots & Quants (5 Lines of Code)

You do not need heavy MCP SDKs. Call SimLab directly via standard HTTP JSON-RPC:

```python
import httpx

# 1. Query Free Macro Regime (Zero Cost)
response = httpx.post(
    "https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp",
    json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "get_market_regime", "arguments": {}}
    },
    headers={"User-Agent": "python-httpx/0.28.1", "x-client-id": "my-trading-bot"}
)
print("Market Regime:", response.json()["result"]["content"][0]["text"])

# 2. Institutional Pre-Trade Check before submitting an exchange order
order_check = httpx.post(
    "https://measmonysuon-simlab-trading-desk-mcp.hf.space/mcp",
    json={
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "pre_trade_check",
            "arguments": {"symbol": "ETH/USD", "action": "LONG", "sizeUsd": 2500}
        }
    },
    headers={
        "User-Agent": "python-httpx/0.28.1",
        "x-client-id": "my-trading-bot",
        # Optional: Set spend key obtained from $1 top-up
        # "x-spend-key": "sk_spend_..." 
    }
)
print("Gate Verdict:", order_check.json())
```

---

## 5. Available Institutional Tools

| Tool Name | Tier | Price | What It Does |
| :--- | :---: | :---: | :--- |
| **`get_market_regime`** | **FREE** | **$0.00** | Headline market regime (BULLISH/BEARISH/HEDGING) & restriction counts. |
| **`simulate_historical_veto`** | **FREE** | **$0.00** | Benchmark scenario replays (Wick trap & fakeout liquidation testing). |
| **`get_performance_audit`** | **FREE** | **$0.00** | Audit record of fleet win rates and champion island parameters. |
| **`pre_trade_check`** | **PAID** | **$0.15** | Comprehensive 6-layer veto matrix (Quarantine Directive, VPIN, Trap Shield). |
| **`validate_trade_execution`** | **PAID** | **$0.05** | Real-time slippage, orderbook depth & toxic spread verification. |
| **`get_alpha_bundle`** | **PAID** | **$0.15** | Full multi-venue alpha bundle for portfolio rebalancing. |
| **`evaluate_dynamic_exit`** | **PAID** | **$0.01** | Post-entry trailing stop & exit scoring engine. |

---

## 6. How to Unlock Paid Calls ($1 Trial Pack)

SimLab uses standard **x402 Micropayments** over Base USDC or Solana Pay:
- **$1 Trial Top-Up:** Unlocks **100 Free Priced Calls** for the calendar month (max 10/hr).
- **Payment Options:**
  - **Base (EVM):** Instant gasless EIP-3009 transfer via `POST https://simlab.measmony.me/x402/topup`.
  - **Solana Pay (SPL USDC):** Native 400ms confirmation via `POST https://simlab.measmony.me/x402/solana/request`.
- Once topped up, you receive an `x-spend-key` to authorize unlimited high-frequency calls.

*For complete API documentation, telemetry, and on-chain proofs, visit [simlab.measmony.me](https://simlab.measmony.me).*
