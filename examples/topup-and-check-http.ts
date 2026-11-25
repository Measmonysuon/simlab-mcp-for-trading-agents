/**
 * Sim Lab x402 Reference Client — Stateless Streamable HTTP Transport
 * ─────────────────────────────────────────────────────────────────────────────
 * Demonstrates:
 * 1. Discovering endpoints via /.well-known/x402 and /.well-known/mcp.json
 * 2. Pre-Trade Execution Gate via validate_trade_execution ($0.05)
 * 3. Handling HTTP 402 / -32042 and executing Base USDC EIP-3009 TransferWithAuthorization
 * 4. Idempotency protection with payment-identifier header
 *
 * Setup:
 *   npm i viem
 *   export SIMLAB_CLIENT_ID="your-agent-name"
 *   export SIMLAB_PRIVATE_KEY="0x..."  // Base wallet funded with USDC
 *
 * Run:
 *   npx tsx examples/topup-and-check-http.ts SOL/USD LONG 5 100
 */

import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.SIMLAB_URL || "https://simlab.measmony.me";
const CLIENT_ID = process.env.SIMLAB_CLIENT_ID || `agent-${Date.now()}`;
const PRIVATE_KEY = process.env.SIMLAB_PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("Missing SIMLAB_PRIVATE_KEY. Set export SIMLAB_PRIVATE_KEY=0x...");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const WALLET = account.address;
let spendKey = process.env.SIMLAB_SPEND_KEY || "";

function getHeaders(idempotencyKey?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": CLIENT_ID,
    "x-wallet": WALLET,
  };
  if (spendKey) h["x-spend-key"] = spendKey;
  if (idempotencyKey) h["payment-identifier"] = idempotencyKey;
  return h;
}

async function callPreTradeGate(symbol: string, side: "LONG" | "SHORT", leverage = 5, notionalUsd = 100) {
  const nonce = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`\n🚀 Calling validate_trade_execution for ${symbol} ${side} (${leverage}x, $${notionalUsd})...`);

  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: getHeaders(nonce),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "validate_trade_execution",
        arguments: { symbol, side, leverage, notionalUsd },
      },
    }),
  });

  const data: any = await res.json();

  if (data.error && data.error.code === -32042) {
    console.log(`⚠️  Received 402 Payment Required: ${data.error.message}`);
    const teaser = data.error.data?.teaser;
    if (teaser) {
      console.log(`🔍 Free Teaser Risk Assessment: Risk Band = ${teaser.riskBand}`);
    }

    // Execute Top-up on Base Mainnet
    console.log(`💳 Executing $1 USDC Top-Up on Base mainnet via x402...`);
    await executeTopup(1);

    // Retry call with new spend key
    console.log(`🔄 Retrying validate_trade_execution with funded balance...`);
    return callPreTradeGate(symbol, side, leverage, notionalUsd);
  }

  if (data.result?.content?.[0]?.text) {
    const verdict = JSON.parse(data.result.content[0].text);
    console.log(`\n================ SIM LAB PRE-TRADE VERDICT ================`);
    console.log(`Status:         ${verdict.approved ? "✅ APPROVED (ALLOW)" : "🛑 VETOED"}`);
    console.log(`Risk Band:      ${verdict.riskBand}`);
    console.log(`Summary:        ${verdict.summaryReason}`);
    console.log(`Safe Leverage:  ${verdict.executionLimits?.safeLeverage}x (Requested: ${verdict.executionLimits?.requestedLeverage}x)`);
    console.log(`Entry Range:    $${verdict.entryZone?.entryMin} - $${verdict.entryZone?.entryMax}`);
    console.log(`Stop Loss:      $${verdict.exitPlan?.stopLoss?.price} (${verdict.exitPlan?.stopLoss?.type})`);
    console.log(`TP Tier 1:      $${verdict.exitPlan?.takeProfitTargets?.tier1AmberBand?.price} (Scale 30%)`);
    console.log(`TP Tier 2:      $${verdict.exitPlan?.takeProfitTargets?.tier2TerminalMidpoint?.price} (Scale 70%)`);
    console.log(`===========================================================\n`);
    return verdict;
  }

  console.error("Unexpected MCP response:", data);
}

async function executeTopup(packUsd = 1) {
  const reqRes = await fetch(`${BASE_URL}/x402/topup`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ packUsd, clientId: CLIENT_ID }),
  });

  if (reqRes.status !== 402) {
    throw new Error(`Expected 402, received ${reqRes.status}`);
  }

  const challengeHeader = reqRes.headers.get("payment-required");
  if (!challengeHeader) throw new Error("Missing PAYMENT-REQUIRED header");
  const challenge = JSON.parse(Buffer.from(challengeHeader, "base64").toString("utf8"));
  const accept = challenge.accepts.find((a: any) => a.network === "eip155:8453");
  if (!accept) throw new Error("Base network option not found in challenge accepts");

  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 120);
  const nonce = ("0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")) as `0x${string}`;

  const authorization = {
    from: WALLET,
    to: accept.payTo,
    value: accept.amount,
    validAfter: "0",
    validBefore: validBefore.toString(),
    nonce,
  };

  const signature = await account.signTypedData({
    domain: {
      name: accept.extra?.name ?? "USD Coin",
      version: accept.extra?.version ?? "2",
      chainId: 8453,
      verifyingContract: accept.asset,
    },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from: WALLET,
      to: accept.payTo,
      value: BigInt(accept.amount),
      validAfter: 0n,
      validBefore,
      nonce,
    },
  });

  const payload = {
    x402Version: 2,
    scheme: "exact",
    network: accept.network,
    accepted: accept,
    resource: challenge.resource,
    payload: { signature, authorization },
  };

  const settleRes = await fetch(`${BASE_URL}/x402/topup`, {
    method: "POST",
    headers: {
      ...getHeaders(),
      "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString("base64"),
    },
    body: JSON.stringify({ packUsd, clientId: CLIENT_ID }),
  });

  if (settleRes.status !== 200) {
    throw new Error(`Settlement failed: ${settleRes.status} ${await settleRes.text()}`);
  }

  const settleData: any = await settleRes.json();
  if (settleData.spendKey) {
    spendKey = settleData.spendKey;
    console.log(`🔑 Spend key acquired: ${spendKey.slice(0, 16)}...`);
  }
  console.log(`✅ On-chain settlement confirmed: tx = ${settleData.tx || "settled"}`);
}

const args = process.argv.slice(2);
const sym = args[0] || "SOL/USD";
const side = (args[1]?.toUpperCase() || "LONG") as "LONG" | "SHORT";
callPreTradeGate(sym, side).catch(console.error);
