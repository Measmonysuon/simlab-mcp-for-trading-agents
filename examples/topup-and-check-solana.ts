/**
 * Sim Lab x402 Solana Pay Reference Client (TypeScript / ESM)
 * ─────────────────────────────────────────────────────────────────────────────
 * Demonstrates:
 * 1. Creating a Solana Pay top-up session via POST /x402/solana/request
 * 2. Displaying the solana: URI & payment QR details for wallet scan (Phantom, Solflare)
 * 3. (Optional) Auto-broadcasting Circle USDC transfer if a Solana private key is provided
 * 4. Polling GET /x402/solana/poll until confirmation & spendKey issuance
 * 5. Executing pre_trade_check over MCP using the issued spendKey
 *
 * Setup (Manual Scan Mode — Zero Dependencies):
 *   export SIMLAB_CLIENT_ID="your-agent-name"
 *   export SIMLAB_SOLANA_WALLET="<YOUR_SOLANA_WALLET_PUBLIC_KEY>"
 *
 * Setup (Optional Automated On-Chain Transfer):
 *   npm i @solana/web3.js @solana/spl-token bs58
 *   export SIMLAB_SOLANA_PRIVATE_KEY="<YOUR_SOLANA_PRIVATE_KEY_BASE58>"
 *
 * Run:
 *   npx tsx examples/topup-and-check-solana.ts [SYMBOL] [LONG|SHORT]
 *   (defaults: ETH/USD SHORT).
 */

const BASE_URL = process.env.SIMLAB_URL || 'https://simlab.measmony.me';
const CLIENT_ID = process.env.SIMLAB_CLIENT_ID || `solana_agent_${Math.random().toString(36).slice(2, 8)}`;
const IS_DEVNET = (process.env.SOLANA_NETWORK || '').toLowerCase().trim() === 'devnet';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || (IS_DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');

// ⚠️ Never use the server's receive wallet as payer. Provide your own wallet holding USDC.
let WALLET = process.env.SIMLAB_SOLANA_WALLET || '';
const PRIVATE_KEY_RAW = process.env.SIMLAB_SOLANA_PRIVATE_KEY || '';
let spendKey = process.env.SIMLAB_SPEND_KEY || '';

// Flat shape returned by live POST /x402/solana/request
interface SolanaSessionResponse {
  success: boolean;
  reference: string;
  solanaUrl: string;
  amountUsdc: number;
  amountAtomic: string;
  recipient: string;
  recipientAta: string;
  mint: string;
  pollEndpoint: string;
  expiresAt: number;
  error?: string;
}

// Shape returned by live GET /x402/solana/poll?reference=...
interface PollResponse {
  status: 'PENDING' | 'CONFIRMED' | 'SETTLED' | 'EXPIRED';
  reference: string;
  solanaUrl?: string;
  signature?: string;
  spendKey?: string;
  balanceMicro?: number;
  balanceUsd?: number;
  error?: string;
}

async function resolveWalletAddress(): Promise<string> {
  if (WALLET) return WALLET;

  // If private key is provided, derive public key
  if (PRIVATE_KEY_RAW) {
    try {
      const { Keypair } = await import('@solana/web3.js');
      const bs58 = (await import('bs58')).default;
      let secretKey: Uint8Array;
      if (PRIVATE_KEY_RAW.trim().startsWith('[')) {
        secretKey = new Uint8Array(JSON.parse(PRIVATE_KEY_RAW));
      } else {
        secretKey = bs58.decode(PRIVATE_KEY_RAW.trim());
      }
      const kp = Keypair.fromSecretKey(secretKey);
      WALLET = kp.publicKey.toBase58();
      console.log(`🔑 Derived Solana Payer Wallet from private key: ${WALLET}`);
      return WALLET;
    } catch (e: any) {
      console.warn(`⚠️ Could not parse SIMLAB_SOLANA_PRIVATE_KEY: ${e.message}`);
    }
  }

  // Fallback throwaway address for free dry-run session testing
  console.warn(`⚠️ SIMLAB_SOLANA_WALLET not set. Generating a random test wallet for dry-run session creation.`);
  console.warn(`   For real payments, export SIMLAB_SOLANA_WALLET="<YOUR_PHANTOM_SOLANA_ADDRESS>"\n`);
  WALLET = `SolTest${Math.random().toString(36).slice(2, 10)}${Date.now()}`.padEnd(32, '1').slice(0, 44);
  return WALLET;
}

async function requestSolanaPaySession(amountUsd = 1.0): Promise<SolanaSessionResponse> {
  console.log(`\n[STEP 1] Requesting Solana Pay Session for $${amountUsd.toFixed(2)} USDC...`);
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
  if (!data.success && !data.reference) {
    throw new Error(`Server returned error: ${data.error || 'Unknown error'}`);
  }

  console.log(`✅ Session Created!`);
  console.log(`   Reference Key: ${data.reference}`);
  console.log(`   Amount:        $${data.amountUsdc} USDC (${data.amountAtomic} micro-units)`);
  console.log(`   Recipient ATA: ${data.recipientAta}`);
  console.log(`   Expires In:    ~15 minutes`);
  console.log(`\n🔗 Solana Pay URI (Scan with Phantom / Solflare):`);
  console.log(`   ${data.solanaUrl}\n`);
  return data;
}

async function maybeAutoTransfer(session: SolanaSessionResponse): Promise<string | null> {
  if (!PRIVATE_KEY_RAW) {
    console.log(`ℹ️ [MANUAL SCAN MODE]: No SIMLAB_SOLANA_PRIVATE_KEY provided.`);
    console.log(`   👉 Scan the Solana Pay URI above with Phantom / Solflare to approve the $${session.amountUsdc} USDC transfer.`);
    console.log(`   (Waiting for on-chain confirmation...)\n`);
    return null;
  }

  console.log(`🚀 [AUTO-BROADCAST]: Executing on-chain Circle USDC transfer with ephemeral reference key...`);
  try {
    const { Connection, PublicKey, Keypair, Transaction } = await import('@solana/web3.js');
    const { getAssociatedTokenAddress, createTransferCheckedInstruction } = await import('@solana/spl-token');
    const bs58 = (await import('bs58')).default;

    let secretKey: Uint8Array;
    if (PRIVATE_KEY_RAW.trim().startsWith('[')) {
      secretKey = new Uint8Array(JSON.parse(PRIVATE_KEY_RAW));
    } else {
      secretKey = bs58.decode(PRIVATE_KEY_RAW.trim());
    }

    const payer = Keypair.fromSecretKey(secretKey);
    const connection = new Connection(SOLANA_RPC, 'confirmed');

    const mintPubkey = new PublicKey(session.mint);
    const recipientAtaPubkey = new PublicKey(session.recipientAta);
    const refPubkey = new PublicKey(session.reference);

    const payerAta = await getAssociatedTokenAddress(mintPubkey, payer.publicKey);
    const amountAtomic = BigInt(session.amountAtomic);

    // Standard SPL Token Transfer Checked
    const transferIx = createTransferCheckedInstruction(
      payerAta,
      mintPubkey,
      recipientAtaPubkey,
      payer.publicKey,
      amountAtomic,
      6
    );

    // Attach reference public key as a non-signer, read-only key per Solana Pay spec
    transferIx.keys.push({
      pubkey: refPubkey,
      isSigner: false,
      isWritable: false,
    });

    const tx = new Transaction().add(transferIx);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);

    const rawTx = tx.serialize();
    const txSig = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
    console.log(`   Transaction broadcasted! TxSig: ${txSig}`);
    await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: txSig }, 'confirmed');
    console.log(`   Confirmed on Solana mainnet! Awaiting Sim Lab ledger settlement...`);
    return txSig;
  } catch (err: any) {
    console.warn(`⚠️ Auto-broadcast failed: ${err.message}. Falling back to polling for manual scan.`);
    return null;
  }
}

async function pollForConfirmation(reference: string, maxAttempts = 45): Promise<PollResponse> {
  console.log(`[STEP 2] Awaiting On-Chain Confirmation via Reference ${reference}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${BASE_URL}/x402/solana/poll?reference=${encodeURIComponent(reference)}`, {
      headers: {
        'x-client-id': CLIENT_ID,
        'x-wallet': WALLET,
      },
    });

    const data = (await res.json()) as PollResponse;

    // Accept on confirmed or settled status (no 'ok' check needed)
    if (data.status === 'CONFIRMED' || data.status === 'SETTLED') {
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

    process.stdout.write(`   Polling attempt ${attempt}/${maxAttempts} (Status: ${data.status || 'PENDING'})...\r`);
    await new Promise((r) => setTimeout(r, 2000));
  }

  throw new Error('Timed out waiting for Solana Pay confirmation. Ensure the transfer was signed and sent.');
}

async function checkMcpPreTrade(symbol = 'ETH/USD', side = 'SHORT'): Promise<void> {
  console.log(`\n[STEP 3] Executing MCP pre_trade_check for ${symbol} (${side}) with spendKey...`);

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

  const postUrl = messageEndpoint.startsWith('http') ? messageEndpoint : `${BASE_URL}${messageEndpoint}`;

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

  console.log(`✅ MCP Tool Called (HTTP Status: ${callRes.status})`);
  const paymentResp = callRes.headers.get('payment-response');
  if (paymentResp) {
    console.log(`   payment-response: ${paymentResp}`);
  }

  console.log(`\n🎯 Pre-Trade Verification Complete!`);
}

async function main() {
  const symbol = process.argv[2] || 'ETH/USD';
  const side = (process.argv[3] || 'SHORT').toUpperCase();

  await resolveWalletAddress();

  console.log(`=======================================================`);
  console.log(`🚀 Sim Lab Solana Pay x402 Micro-Billing Client`);
  console.log(`   Client ID: ${CLIENT_ID}`);
  console.log(`   Wallet:    ${WALLET}`);
  console.log(`=======================================================`);

  // 1. Request topup session
  const session = await requestSolanaPaySession(1.0);

  // 2. Either auto-broadcast or prompt manual scan
  await maybeAutoTransfer(session);

  // 3. Poll for on-chain confirmation
  await pollForConfirmation(session.reference);

  // 4. MCP pre_trade_check with the issued spendKey
  await checkMcpPreTrade(symbol, side);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
