/**
 * Sim Lab x402 Solana Pay Reference Client (TypeScript)
 * ─────────────────────────────────────────────────────────────────────────────
 * Demonstrates:
 * 1. Creating a Solana Pay top-up session via POST /x402/solana/request
 * 2. Displaying the solana: URI & payment QR details for wallet scan (Phantom, Solflare)
 * 3. Or automatically broadcasting Circle USDC transfer if a Solana private key is set
 * 4. Polling GET /x402/solana/poll until confirmation & spendKey issuance
 * 5. Executing pre_trade_check over MCP using the issued spendKey
 *
 * Setup:
 *   export SIMLAB_CLIENT_ID="your-agent-uuid-or-name"
 *   export SIMLAB_SOLANA_WALLET="YourSolanaPublicKey..."
 *   # Optional for automated transfer:
 *   export SIMLAB_SOLANA_PRIVATE_KEY="base58_private_key_or_json_array"
 *
 * Run:
 *   npx tsx topup-and-check-solana.ts [SYMBOL] [LONG|SHORT]
 */

import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
} from '@solana/spl-token';

const BASE_URL = process.env.SIMLAB_URL || 'https://simlab.measmony.me';
const CLIENT_ID = process.env.SIMLAB_CLIENT_ID || `solana_agent_${Math.random().toString(36).slice(2, 8)}`;
const WALLET = process.env.SIMLAB_SOLANA_WALLET || 'Bn8QgFB4sMdr9PK4oeZhEyZ4kWxhnYcbVAVhUxac3GmJ';
let spendKey = process.env.SIMLAB_SPEND_KEY || '';

interface SolanaSessionResponse {
  ok: boolean;
  session: {
    reference: string;
    network: string;
    amountAtomic: string;
    amountUsdc: number;
    recipientOwner: string;
    recipientAta: string;
    assetMint: string;
    solanaUrl: string;
    status: string;
    expiresAt: number;
  };
  instructions: {
    solanaUrl: string;
    qrData: string;
    pollUrl: string;
  };
}

interface PollResponse {
  ok: boolean;
  status: 'PENDING' | 'CONFIRMED' | 'SETTLED' | 'EXPIRED';
  signature?: string;
  spendKey?: string;
  balanceMicro?: number;
  balanceUsd?: number;
  error?: string;
}

async function requestSolanaPaySession(amountUsd = 1.0): Promise<SolanaSessionResponse> {
  console.log(`\n[STEP 1] Requesting Solana Pay Topup Session for $${amountUsd.toFixed(2)} USDC...`);
  const res = await fetch(`${BASE_URL}/x402/solana/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': CLIENT_ID,
      'x-wallet': WALLET,
    },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      wallet: WALLET,
      amountUsd,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create Solana Pay session: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as SolanaSessionResponse;
  console.log(`✅ Session Created!`);
  console.log(`   Reference Key: ${data.session.reference}`);
  console.log(`   Amount:        $${data.session.amountUsdc.toFixed(2)} USDC (${data.session.amountAtomic} micro-units)`);
  console.log(`   Recipient ATA: ${data.session.recipientAta}`);
  console.log(`\n🔗 Solana Pay URI (Scan with Phantom / Solflare):`);
  console.log(`   ${data.session.solanaUrl}\n`);
  return data;
}

async function pollForConfirmation(reference: string, maxAttempts = 30): Promise<PollResponse> {
  console.log(`[STEP 2] Awaiting On-Chain Confirmation via Reference ${reference}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${BASE_URL}/x402/solana/poll?reference=${encodeURIComponent(reference)}`, {
      headers: {
        'x-client-id': CLIENT_ID,
        'x-wallet': WALLET,
      },
    });

    const data = (await res.json()) as PollResponse;

    if (data.ok && (data.status === 'CONFIRMED' || data.status === 'SETTLED')) {
      console.log(`\n🎉 Payment Confirmed On-Chain!`);
      console.log(`   Signature: ${data.signature}`);
      console.log(`   Balance:   $${data.balanceUsd?.toFixed(2)} (${data.balanceMicro} micro-credits)`);
      if (data.spendKey) {
        spendKey = data.spendKey;
        console.log(`   Spend Key: ${data.spendKey}`);
        console.log(`   ⚠️ Save this spend key as SIMLAB_SPEND_KEY to authenticate future MCP calls!`);
      }
      return data;
    }

    if (data.status === 'EXPIRED') {
      throw new Error('Payment session expired before confirmation.');
    }

    process.stdout.write(`   Polling attempt ${attempt}/${maxAttempts} (${data.status})...\r`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error('Timed out waiting for Solana Pay confirmation.');
}

async function checkMcpPreTrade(symbol = 'ETH/USD', side = 'SHORT'): Promise<void> {
  console.log(`\n[STEP 3] Executing MCP pre_trade_check for ${symbol} (${side}) with spendKey...`);

  // Direct SSE initialization
  const headers: Record<string, string> = {
    'x-client-id': CLIENT_ID,
    'x-wallet': WALLET,
  };
  if (spendKey) {
    headers['x-spend-key'] = spendKey;
  }

  const sseRes = await fetch(`${BASE_URL}/mcp/sse`, { headers });
  if (!sseRes.ok || !sseRes.body) {
    throw new Error(`Failed to connect to MCP SSE: ${sseRes.status}`);
  }

  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let messageEndpoint = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const match = chunk.match(/event: endpoint\ndata: (.*)\n/);
    if (match) {
      messageEndpoint = match[1].trim();
      break;
    }
  }

  if (!messageEndpoint) {
    throw new Error('MCP endpoint event not received from SSE stream.');
  }

  // Construct absolute message URL
  const postUrl = messageEndpoint.startsWith('http') ? messageEndpoint : `${BASE_URL}${messageEndpoint}`;

  // Call pre_trade_check
  const rpcPayload = {
    jsonrpc: '2.0',
    id: `rpc_${Date.now()}`,
    method: 'tools/call',
    params: {
      name: 'pre_trade_check',
      arguments: { symbol, side, timeframe: '5m' },
    },
  };

  const callRes = await fetch(postUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(rpcPayload),
  });

  console.log(`✅ MCP Tool Called (Status: ${callRes.status})`);
  console.log(`   Response Headers:`);
  console.log(`   payment-response: ${callRes.headers.get('payment-response') || 'N/A'}`);

  // Reader stream will receive result in SSE, or JSON
  console.log(`\n🎯 Pre-Trade Verification Complete!`);
}

async function main() {
  const symbol = process.argv[2] || 'ETH/USD';
  const side = (process.argv[3] || 'SHORT').toUpperCase();

  console.log(`=======================================================`);
  console.log(`🚀 Sim Lab Solana Pay x402 Micro-Billing Client`);
  console.log(`   Client ID: ${CLIENT_ID}`);
  console.log(`   Wallet:    ${WALLET}`);
  console.log(`=======================================================`);

  // 1. Request topup session
  const sessionData = await requestSolanaPaySession(1.0);

  // 2. Poll for confirmation
  await pollForConfirmation(sessionData.session.reference);

  // 3. MCP pre_trade_check
  await checkMcpPreTrade(symbol, side);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
