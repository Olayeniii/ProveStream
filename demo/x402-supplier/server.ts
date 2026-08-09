/**
 * Reference x402 claim endpoint for testing the agent's x402/Gateway payout
 * path end to end. ProveStream doesn't control real suppliers' infrastructure,
 * so this stands in for one: a minimal HTTP server that challenges with a real
 * 402 + `accepts[]`, and on retry with a valid `X-PAYMENT` (Circle Gateway
 * attestation), submits `gatewayMint` itself — a real on-chain call, paying its
 * own gas from `RELAY_PRIVATE_KEY` — and returns the real resulting tx hash.
 *
 * Standalone fixture, not a monorepo package — run directly:
 *   RELAY_PRIVATE_KEY=0x... RECIPIENT_ADDRESS=0x... npx tsx demo/x402-supplier/server.ts
 *
 * `RELAY_PRIVATE_KEY` only needs a small amount of Arc testnet gas token to
 * pay for the `gatewayMint` call — per Circle Gateway's own `TransferSpec`
 * (`destinationCaller: 0` = any caller may relay), the minted funds go to
 * whatever `destinationRecipient` the treasury signed, not to this wallet.
 */
import { createServer } from 'node:http';

import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/** Same values independently verified on-chain in `agent/src/services/x402Service.ts`. */
const GATEWAY_MINTER_ADDRESS: Address = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';
const ARC_TESTNET_USDC_ERC20: Address = '0x3600000000000000000000000000000000000000';
const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_TESTNET_RPC_URL = 'https://rpc.testnet.arc.io';

const GATEWAY_MINT_ABI = [
  {
    type: 'function',
    name: 'gatewayMint',
    inputs: [
      { name: 'attestationPayload', type: 'bytes' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}.`);
  }
  return value;
}

const port = Number(process.env.X402_DEMO_PORT ?? '4100');
const recipientAddress = requireEnv('RECIPIENT_ADDRESS') as Address;
if (!isAddress(recipientAddress)) {
  throw new Error('RECIPIENT_ADDRESS must be a valid EVM address.');
}
const relayAccount = privateKeyToAccount(requireEnv('RELAY_PRIVATE_KEY') as Hex);

const publicClient = createPublicClient({ transport: http(ARC_TESTNET_RPC_URL) });
const walletClient = createWalletClient({
  account: relayAccount,
  transport: http(ARC_TESTNET_RPC_URL),
});

interface X402Payload {
  x402Version: number;
  accepted: { scheme: string; network: string; amount: string; asset: string; payTo: string };
  payload: { attestation: Hex; operatorSignature: Hex };
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${port.toString()}`);
    const rewardId = url.searchParams.get('rewardId');
    const amount = url.searchParams.get('amount');
    if (!rewardId || !amount) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'rewardId and amount query params are required.' }));
      return;
    }

    const paymentHeader = req.headers['x-payment'];
    if (!paymentHeader || typeof paymentHeader !== 'string') {
      // Phase 1: challenge.
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          x402Version: 1,
          accepts: [
            {
              scheme: 'exact',
              network: `eip155:${ARC_TESTNET_CHAIN_ID.toString()}`,
              amount,
              asset: ARC_TESTNET_USDC_ERC20,
              payTo: recipientAddress,
              maxTimeoutSeconds: 300,
            },
          ],
        }),
      );
      return;
    }

    // Phase 2: pay — decode the attestation and actually mint on-chain.
    let decoded: X402Payload;
    try {
      decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8')) as X402Payload;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'X-PAYMENT header is not valid base64 JSON.' }));
      return;
    }

    try {
      console.log(`Relaying gatewayMint for reward ${rewardId}...`);
      const txHash = await walletClient.writeContract({
        chain: null,
        address: GATEWAY_MINTER_ADDRESS,
        abi: GATEWAY_MINT_ABI,
        functionName: 'gatewayMint',
        args: [decoded.payload.attestation, decoded.payload.operatorSignature],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`gatewayMint confirmed: ${txHash}`);

      const settlementResponse = {
        success: true,
        transaction: txHash,
        network: `eip155:${ARC_TESTNET_CHAIN_ID.toString()}`,
      };
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-PAYMENT-RESPONSE': Buffer.from(JSON.stringify(settlementResponse)).toString('base64'),
      });
      res.end(JSON.stringify({ status: 'paid', rewardId, txHash }));
    } catch (error) {
      console.error('gatewayMint failed:', error);
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `gatewayMint reverted or failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
  })();
});

server.listen(port, () => {
  console.log(`x402 demo supplier server listening on http://localhost:${port.toString()}`);
  console.log(`Recipient (destinationRecipient): ${recipientAddress}`);
  console.log(`Relay wallet (pays gatewayMint gas): ${relayAccount.address}`);
});
