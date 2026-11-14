#!/usr/bin/env python3
"""Sim Lab x402 reference client (Python).

Flow: check balance -> (if needed) top up USDC on Base via the x402
handshake -> call pre_trade_check over MCP (legacy SSE) -> print the
ALLOW/VETO verdict. On a -32042 (insufficient credit) it tops up $1 and
retries the call once — the pattern every agent integration needs.

This code is adapted from the client that performed Sim Lab's first
live settlements (see ../proof/RECEIPTS.md). The two rules that break
every first attempt are marked with ⚠️.

Setup:
    pip install eth-account
    export SIMLAB_CLIENT_ID="your-agent-name"        # stable, unguessable
    export SIMLAB_PRIVATE_KEY="0x..."                # Base wallet key,
        # funded with a little USDC on Base. NEVER commit this value.

Run:
    python3 topup-and-check.py [SYMBOL] [LONG|SHORT]
    (defaults: ETH/USD SHORT). Topping up spends REAL USDC ($1).
"""
import base64
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from eth_account import Account
from eth_account.messages import encode_typed_data

BASE = "https://simlab.measmony.me"
CLIENT_ID = os.environ["SIMLAB_CLIENT_ID"]
PRIVATE_KEY = os.environ["SIMLAB_PRIVATE_KEY"]
WALLET = Account.from_key(PRIVATE_KEY).address


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = urllib.request.build_opener(NoRedirect())


def http(method, url, headers=None, body=None, timeout=60):
    hdrs = {"x-client-id": CLIENT_ID, "x-wallet": WALLET}
    if headers:
        hdrs.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with OPENER.open(req, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read().decode("utf-8", "replace")


def get_balance():
    _, _, body = http("GET", f"{BASE}/x402/balance")
    return int(json.loads(body)["balanceMicro"])


def topup(pack_usd=1):
    """Run the x402 top-up handshake. Returns the settlement tx hash."""
    status, headers, _ = http("POST", f"{BASE}/x402/topup",
                              body={"packUsd": pack_usd, "clientId": CLIENT_ID})
    assert status == 402, f"expected 402 challenge, got {status}"
    header = next(v for k, v in headers.items()
                  if k.lower() == "payment-required")
    challenge = json.loads(base64.b64decode(header))
    accept = next(a for a in challenge["accepts"]
                  if a["network"] == "eip155:8453")  # Base mainnet

    now = int(time.time())
    auth = {"from": WALLET, "to": accept["payTo"], "value": accept["amount"],
            "validAfter": "0", "validBefore": str(now + 100),
            "nonce": "0x" + secrets.token_hex(32)}
    typed = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"}],
            "TransferWithAuthorization": [
                {"name": "from", "type": "address"},
                {"name": "to", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "validAfter", "type": "uint256"},
                {"name": "validBefore", "type": "uint256"},
                {"name": "nonce", "type": "bytes32"}]},
        "primaryType": "TransferWithAuthorization",
        # ⚠️ RULE 1: Base USDC's on-chain EIP-712 domain name is
        # "USD Coin" (version "2") — NOT "USDC". Prefer the challenge's
        # own accept.extra values when present.
        "domain": {"name": accept.get("extra", {}).get("name", "USD Coin"),
                   "version": accept.get("extra", {}).get("version", "2"),
                   "chainId": 8453, "verifyingContract": accept["asset"]},
        "message": {"from": WALLET, "to": accept["payTo"],
                    "value": int(accept["amount"]), "validAfter": 0,
                    "validBefore": int(auth["validBefore"]),
                    "nonce": auth["nonce"]},
    }
    signature = Account.sign_message(
        encode_typed_data(full_message=typed), PRIVATE_KEY).signature.hex()
    if not signature.startswith("0x"):
        signature = "0x" + signature
    payload = {
        "x402Version": 2, "scheme": "exact", "network": accept["network"],
        # ⚠️ RULE 2: the payload MUST include `accepted` (the accept
        # entry you chose) and the challenge's `resource`, or the
        # server rejects it with HTTP 400.
        "accepted": accept, "resource": challenge.get("resource"),
        "payload": {"signature": signature, "authorization": auth},
    }
    payment_header = base64.b64encode(json.dumps(payload).encode()).decode()
    status, headers, body = http(
        "POST", f"{BASE}/x402/topup",
        headers={"PAYMENT-SIGNATURE": payment_header},
        body={"packUsd": pack_usd, "clientId": CLIENT_ID}, timeout=120)
    assert status == 200, f"top-up failed: {status} {body[:200]}"
    receipt_header = next(v for k, v in headers.items()
                          if k.lower() == "payment-response")
    receipt = json.loads(base64.b64decode(receipt_header))
    assert receipt["success"], f"settlement failed: {receipt}"
    return receipt["transaction"]


class McpSse:
    """Minimal legacy-SSE MCP client (Sim Lab predates streamable HTTP)."""

    def __init__(self):
        self.seq = 0

    def open(self):
        req = urllib.request.Request(
            f"{BASE}/mcp/sse",
            headers={"x-client-id": CLIENT_ID, "x-wallet": WALLET,
                     "Accept": "text/event-stream"}, method="GET")
        self.stream = OPENER.open(req, timeout=30)
        _, data = self._read_event()
        self.messages_url = urllib.parse.urljoin(f"{BASE}/mcp/sse",
                                                 data.strip())
        self.send("initialize", {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": CLIENT_ID, "version": "1.0"}})
        self.send("notifications/initialized", {}, notification=True)

    def _read_event(self):
        event, lines = None, []
        while True:
            line = self.stream.readline().decode("utf-8", "replace").rstrip("\r\n")
            if line == "":
                if event is not None or lines:
                    return event, "\n".join(lines)
                continue
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                lines.append(line[5:].lstrip(" "))

    def send(self, method, params, notification=False):
        self.seq += 1
        payload = {"jsonrpc": "2.0", "method": method, "params": params}
        if not notification:
            payload["id"] = self.seq
        req = urllib.request.Request(
            self.messages_url, data=json.dumps(payload).encode(),
            headers={"x-client-id": CLIENT_ID, "x-wallet": WALLET,
                     "Content-Type": "application/json"}, method="POST")
        with OPENER.open(req, timeout=60) as resp:
            resp.read()
        if notification:
            return None
        while True:
            event, data = self._read_event()
            if event != "message":
                continue
            msg = json.loads(data)
            if msg.get("id") == self.seq:
                return msg

    def call_tool(self, name, arguments):
        msg = self.send("tools/call", {"name": name, "arguments": arguments})
        if "error" in msg:
            err = msg["error"]
            if err.get("code") == -32042:
                raise InsufficientCredit(err)
            raise RuntimeError(f"tool error: {err}")
        return json.loads(msg["result"]["content"][0]["text"])


class InsufficientCredit(Exception):
    pass


def main():
    symbol = sys.argv[1] if len(sys.argv) > 1 else "ETH/USD"
    side = sys.argv[2] if len(sys.argv) > 2 else "SHORT"
    print(f"wallet {WALLET} · client {CLIENT_ID}")
    print(f"Sim Lab credit: ${get_balance() / 1e6:.2f}")
    mcp = McpSse()
    mcp.open()
    try:
        verdict = mcp.call_tool("pre_trade_check",
                                {"symbol": symbol, "side": side})
    except InsufficientCredit:
        print("insufficient credit — topping up $1 (real USDC)…")
        tx = topup(1)
        print(f"settled: https://basescan.org/tx/{tx}")
        verdict = mcp.call_tool("pre_trade_check",
                                {"symbol": symbol, "side": side})
    print(json.dumps(verdict, indent=2))
    print(f"credit after: ${get_balance() / 1e6:.2f}")


if __name__ == "__main__":
    main()
