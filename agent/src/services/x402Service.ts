import { randomBytes } from 'node:crypto';

import { bytesToHex, pad } from 'viem';
import type { Address, Hex, PublicClient } from 'viem';

import type { TreasuryService, TypedDataInput } from './treasuryService.js';

/**
 * Circle Gateway on Arc testnet — every value below was independently
 * verified against real, live sources before use (not assumed from
 * documentation): `GATEWAY_WALLET_ADDRESS`/`GATEWAY_MINTER_ADDRESS` have real
 * deployed bytecode on Arc testnet (checked via `getBytecode`), and calling
 * the real `domainSeparator()` on `GATEWAY_WALLET_ADDRESS` reproduces
 * `keccak256(abi.encode(TYPE_HASH, keccak256("GatewayWallet"), keccak256("1")))`
 * byte-for-byte, confirming both the addresses and the domain against
 * Circle's own public source (github.com/circlefin/evm-gateway-contracts).
 * `GATEWAY_DOMAIN_ARC` is Circle's own domain id for Arc (distinct from
 * Arc's EVM chain id, 5042002) — confirmed via
 * developers.circle.com/gateway/references/supported-blockchains.
 */
const GATEWAY_DOMAIN_ARC = 26;
const GATEWAY_WALLET_ADDRESS: Address = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
const GATEWAY_MINTER_ADDRESS: Address = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';
const ARC_TESTNET_USDC_ERC20: Address = '0x3600000000000000000000000000000000000000';
const GATEWAY_API_BASE = 'https://gateway-api-testnet.circle.com';

/** How many blocks past "now" a signed burn intent stays valid for. */
const MAX_BLOCK_HEIGHT_BUFFER = 500n;

/**
 * `GatewayWallet`'s domain deliberately omits `chainId`/`verifyingContract`
 * (see `treasuryService.ts`'s `TypedDataInput` doc) — a signature is valid
 * across every domain Gateway supports, not tied to one chain.
 */
const GATEWAY_DOMAIN = { name: 'GatewayWallet', version: '1' };

/** Field order/types reproduced exactly from `TransferSpec.sol`/`BurnIntents.sol` — verify against that source before changing. */
const BURN_INTENT_TYPES: TypedDataInput['types'] = {
  BurnIntent: [
    { name: 'maxBlockHeight', type: 'uint256' },
    { name: 'maxFee', type: 'uint256' },
    { name: 'spec', type: 'TransferSpec' },
  ],
  TransferSpec: [
    { name: 'version', type: 'uint32' },
    { name: 'sourceDomain', type: 'uint32' },
    { name: 'destinationDomain', type: 'uint32' },
    { name: 'sourceContract', type: 'bytes32' },
    { name: 'destinationContract', type: 'bytes32' },
    { name: 'sourceToken', type: 'bytes32' },
    { name: 'destinationToken', type: 'bytes32' },
    { name: 'sourceDepositor', type: 'bytes32' },
    { name: 'destinationRecipient', type: 'bytes32' },
    { name: 'sourceSigner', type: 'bytes32' },
    { name: 'destinationCaller', type: 'bytes32' },
    { name: 'value', type: 'uint256' },
    { name: 'salt', type: 'bytes32' },
    { name: 'hookData', type: 'bytes' },
  ],
};

/** `TransferSpec`/`BurnIntent` pack addresses as left-padded `bytes32`, not plain `address`. */
function addressToBytes32(address: Address): Hex {
  return pad(address, { size: 32 });
}

export interface X402ClaimInput {
  claimUrl: string;
  rewardId: string;
  supplier: Address;
  /** Atomic units, 6-decimal USDC (Arc's ERC-20 interface, not the native 18-decimal asset). */
  amount: bigint;
}

export type X402ClaimResult =
  { status: 'complete'; txHash: Hex } | { status: 'failed'; error: string };

/** `PaymentRequirements`, x402 spec v2 §5.1.2 — one entry in a 402 response's `accepts[]`. */
interface X402PaymentRequirement {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

interface X402ChallengeBody {
  x402Version: number;
  accepts: X402PaymentRequirement[];
}

/** `SettlementResponse`, x402 spec v2 §5.3.2 — the decoded `X-PAYMENT-RESPONSE` header. */
interface X402SettlementResponse {
  success: boolean;
  errorReason?: string;
  transaction: string;
  network: string;
}

interface GatewayTransferResponse {
  attestation: Hex;
  signature: Hex;
}

/**
 * Pays a supplier's x402-gated claim endpoint via Circle Gateway's
 * burn-and-mint rail instead of a same-chain push transfer. The treasury
 * signs a `BurnIntent` naming the supplier's own address as
 * `destinationRecipient`; Circle's Gateway API (`/v1/transfer`) processes the
 * burn and returns a signed attestation. That attestation — not a raw
 * transfer — is handed to the supplier's endpoint as x402 payment proof; the
 * endpoint calls `gatewayMint` itself (paying its own gas) to actually
 * receive the funds and reports the real mint tx hash back. Source and
 * destination domain are both Arc (26) here — same-chain in this demo, but
 * the same code path works unmodified for a genuinely cross-chain claim
 * endpoint since nothing here assumes source === destination.
 */
export class X402Service {
  constructor(
    private readonly treasuryService: TreasuryService,
    private readonly publicClient: PublicClient,
  ) {}

  async claim(input: X402ClaimInput): Promise<X402ClaimResult> {
    // `amount` is passed as a hint, not authority — real x402 sellers price from
    // their own records, but this protocol has no shared price catalog between
    // the agent and a supplier's claim endpoint, so the endpoint is expected to
    // echo it back in its own `accepts[]`; `claim()` still independently checks
    // that echo matches `input.amount` below before paying anything.
    const separator = input.claimUrl.includes('?') ? '&' : '?';
    const claimUrl = `${input.claimUrl}${separator}rewardId=${encodeURIComponent(input.rewardId)}&amount=${input.amount.toString()}`;

    const challengeResponse = await fetch(claimUrl);
    if (challengeResponse.status !== 402) {
      return {
        status: 'failed',
        error: `Expected HTTP 402 from the claim endpoint, got ${challengeResponse.status.toString()}.`,
      };
    }
    const challenge = (await challengeResponse.json()) as X402ChallengeBody;
    const accepted = challenge.accepts.find(
      (entry) => entry.scheme === 'exact' && entry.asset.toLowerCase() === ARC_TESTNET_USDC_ERC20,
    );
    if (!accepted) {
      return {
        status: 'failed',
        error: 'Claim endpoint did not offer the "exact" scheme in Arc USDC.',
      };
    }
    if (BigInt(accepted.amount) !== input.amount) {
      return {
        status: 'failed',
        error: `Claim endpoint requested ${accepted.amount}, expected ${input.amount.toString()}.`,
      };
    }

    const gatewayResult = await this.submitBurnIntent(accepted.payTo as Address, input.amount);
    if (gatewayResult.status === 'failed') {
      return gatewayResult;
    }

    const paymentPayload = {
      x402Version: challenge.x402Version,
      accepted,
      payload: {
        attestation: gatewayResult.attestation,
        operatorSignature: gatewayResult.signature,
      },
    };
    const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

    const settleResponse = await fetch(claimUrl, { headers: { 'X-PAYMENT': paymentHeader } });
    if (!settleResponse.ok) {
      return {
        status: 'failed',
        error: `Claim endpoint rejected the payment (HTTP ${settleResponse.status.toString()}).`,
      };
    }
    const responseHeader = settleResponse.headers.get('X-PAYMENT-RESPONSE');
    if (!responseHeader) {
      return { status: 'failed', error: 'Claim endpoint did not return an X-PAYMENT-RESPONSE.' };
    }
    const settlement = JSON.parse(
      Buffer.from(responseHeader, 'base64').toString('utf8'),
    ) as X402SettlementResponse;
    if (!settlement.success || !settlement.transaction) {
      return {
        status: 'failed',
        error: settlement.errorReason ?? 'Claim endpoint reported the settlement as unsuccessful.',
      };
    }

    return { status: 'complete', txHash: settlement.transaction as Hex };
  }

  /** Signs a same-domain `BurnIntent` and submits it to Circle's Gateway API, returning the attestation needed to mint. */
  private async submitBurnIntent(
    recipient: Address,
    amount: bigint,
  ): Promise<
    { status: 'complete'; attestation: Hex; signature: Hex } | { status: 'failed'; error: string }
  > {
    const treasuryAddress = await this.treasuryService.getAddress();
    const currentBlock = await this.publicClient.getBlockNumber();
    const salt = bytesToHex(randomBytes(32));

    const message = {
      maxBlockHeight: currentBlock + MAX_BLOCK_HEIGHT_BUFFER,
      maxFee: amount / 100n, // 1% ceiling — Gateway testnet's real fee schedule isn't published; tighten once observed live.
      spec: {
        version: 1,
        sourceDomain: GATEWAY_DOMAIN_ARC,
        destinationDomain: GATEWAY_DOMAIN_ARC,
        sourceContract: addressToBytes32(GATEWAY_WALLET_ADDRESS),
        destinationContract: addressToBytes32(GATEWAY_MINTER_ADDRESS),
        sourceToken: addressToBytes32(ARC_TESTNET_USDC_ERC20),
        destinationToken: addressToBytes32(ARC_TESTNET_USDC_ERC20),
        sourceDepositor: addressToBytes32(treasuryAddress),
        destinationRecipient: addressToBytes32(recipient),
        sourceSigner: addressToBytes32(treasuryAddress),
        destinationCaller: pad('0x0', { size: 32 }),
        value: amount,
        salt,
        hookData: '0x' as Hex,
      },
    };

    const typedData: TypedDataInput = {
      domain: GATEWAY_DOMAIN,
      types: BURN_INTENT_TYPES,
      primaryType: 'BurnIntent',
      message,
    };

    let signature: Hex;
    try {
      signature = await this.treasuryService.signTypedData(typedData);
    } catch (error) {
      return {
        status: 'failed',
        error: `Failed to sign the burn intent: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // Gateway's own transfer API expects `bigint` fields as JSON strings.
    const burnIntentForApi = {
      maxBlockHeight: message.maxBlockHeight.toString(),
      maxFee: message.maxFee.toString(),
      spec: { ...message.spec, value: message.spec.value.toString() },
    };

    const transferResponse = await fetch(`${GATEWAY_API_BASE}/v1/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ burnIntent: burnIntentForApi, signature }]),
    });
    if (!transferResponse.ok) {
      return {
        status: 'failed',
        error: `Gateway /v1/transfer rejected the burn intent (HTTP ${transferResponse.status.toString()}): ${await transferResponse.text()}`,
      };
    }
    const result = (await transferResponse.json()) as GatewayTransferResponse;
    if (!result.attestation || !result.signature) {
      return {
        status: 'failed',
        error: 'Gateway /v1/transfer did not return an attestation.',
      };
    }
    return { status: 'complete', attestation: result.attestation, signature: result.signature };
  }
}
