/**
 * Sim Lab x402 reference client (TypeScript, viem).
 *
 * Same flow as topup-and-check.py: check balance -> top up USDC on Base
 * via the x402 handshake if needed -> pre_trade_check over MCP (legacy
 * SSE) -> print the ALLOW/VETO verdict. A -32042 triggers one $1 top-up
 * and one retry.
 *
 * Setup:
 *   npm init -y && npm i viem tsx
 *   export SIMLAB_CLIENT_ID="your-agent-name"     // stable, unguessable
 *   export SIMLAB_PRIVATE_KEY="0x..."             // Base wallet key,
 *        // funded with a little USDC on Base. NEVER commit this value.
 * Run:
 *   npx tsx topup-and-check.ts [SYMBOL] [LONG|SHORT]
 *   (defaults: ETH/USD SHORT). Topping up spends REAL USDC ($1).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { privateKeyToAccount } = require("viem/accounts");

const BASE_URL = "https://simlab.measmony.me";
const CLIENT_ID = process.env.SIMLAB_CLIENT_ID!;
const account = privateKeyToAccount(process.env.SIMLAB_PRIVATE_KEY as `0x${string}`);
const WALLET = account.address;

const idHeaders = { "x-client-id": CLIENT_ID, "x-wallet": WALLET };

async function getBalance(): Promise<number> {
  const r = await fetch(`${BASE_URL}/x402/balance`, { headers: idHeaders });
  const j = (await r.json()) as { balanceMicro: string };
  return Number(j.balanceMicro);
}

async function topup(packUsd = 1): Promise<string> {
  const res = await fetch(`${BASE_URL}/x402/topup`, {
    method: "POST",
    headers: { ...idHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ packUsd, clientId: CLIENT_ID }),
  });
  if (res.status !== 402) throw new Error(`expected 402, got ${res.status}`);
  const challenge = JSON.parse(
    Buffer.from(res.headers.get("payment-required")!, "base64").toString(),
  );
  const accept = challenge.accepts.find(
    (a: any) => a.network === "eip155:8453",
  );

  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 100);
  const nonce = ("0x" +
    Array.from(crypto.getRandomValues(new Uint8Array(32)))
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
      // ⚠️ RULE 1: Base USDC's on-chain EIP-712 domain name is
      // "USD Coin" (version "2") — NOT "USDC". Prefer accept.extra.
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
    // ⚠️ RULE 2: the payload MUST include `accepted` and `resource`,
    // or the server rejects it with HTTP 400.
    accepted: accept,
    resource: challenge.resource,
    payload: { signature, authorization },
  };
  const res2 = await fetch(`${BASE_URL}/x402/topup`, {
    method: "POST",
    headers: {
      ...idHeaders,
      "Content-Type": "application/json",
      "PAYMENT-SIGNATURE": Buffer.from(JSON.stringify(payload)).toString(
        "base64",
      ),
    },
    body: JSON.stringify({ packUsd, clientId: CLIENT_ID }),
  });
  if (res2.status !== 200)
    throw new Error(`top-up failed: ${res2.status} ${await res2.text()}`);
  const receipt = JSON.parse(
    Buffer.from(res2.headers.get("payment-response")!, "base64").toString(),
  );
  if (!receipt.success) throw new Error(`settlement failed: ${JSON.stringify(receipt)}`);
  return receipt.transaction as string;
}

/** Minimal legacy-SSE MCP client. */
class McpSse {
  private seq = 0;
  private messagesUrl = "";
  private buffer = "";
  private waiters: Array<(msg: any) => void> = [];
  private byId = new Map<number, (msg: any) => void>();

  async open() {
    const res = await fetch(`${BASE_URL}/mcp/sse`, {
      headers: { ...idHeaders, Accept: "text/event-stream" },
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let endpoint = "";
    const pump = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        this.buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = this.buffer.indexOf("\n\n")) >= 0) {
          const raw = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          const dataLine = raw
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const data = dataLine.slice(5).trim();
          const evLine = raw
            .split("\n")
            .find((l) => l.startsWith("event:"));
          const event = evLine ? evLine.slice(6).trim() : "message";
          if (event === "endpoint") {
            endpoint = data;
            this.messagesUrl = new URL(data, `${BASE_URL}/mcp/sse`).href;
          } else if (event === "message") {
            const msg = JSON.parse(data);
            const w = this.byId.get(msg.id);
            if (w) {
              this.byId.delete(msg.id);
              w(msg);
            }
          }
        }
      }
    })();
    void pump;
    while (!endpoint) await new Promise((r) => setTimeout(r, 25));
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: CLIENT_ID, version: "1.0" },
    });
    await this.send("notifications/initialized", {}, true);
  }

  async send(method: string, params: any, notification = false): Promise<any> {
    const id = ++this.seq;
    const body: any = { jsonrpc: "2.0", method, params };
    if (!notification) body.id = id;
    const p = notification
      ? Promise.resolve(null)
      : new Promise((resolve) => this.byId.set(id, resolve));
    await fetch(this.messagesUrl, {
      method: "POST",
      headers: { ...idHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return p;
  }

  async callTool(name: string, args: any): Promise<any> {
    const msg = await this.send("tools/call", { name, arguments: args });
    if (msg.error) {
      const e = new Error(msg.error.message) as any;
      e.code = msg.error.code;
      throw e;
    }
    return JSON.parse(msg.result.content[0].text);
  }
}

const symbol = process.argv[2] ?? "ETH/USD";
const side = process.argv[3] ?? "SHORT";
console.log(`wallet ${WALLET} · client ${CLIENT_ID}`);
console.log(`Sim Lab credit: $${((await getBalance()) / 1e6).toFixed(2)}`);
const mcp = new McpSse();
await mcp.open();
let verdict: any;
try {
  verdict = await mcp.callTool("pre_trade_check", { symbol, side });
} catch (e: any) {
  if (e.code !== -32042) throw e;
  console.log("insufficient credit — topping up $1 (real USDC)…");
  const tx = await topup(1);
  console.log(`settled: https://basescan.org/tx/${tx}`);
  verdict = await mcp.callTool("pre_trade_check", { symbol, side });
}
console.log(JSON.stringify(verdict, null, 2));
console.log(`credit after: $${((await getBalance()) / 1e6).toFixed(2)}`);
process.exit(0);
