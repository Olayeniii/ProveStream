import { AppKit, BridgeChain } from '@circle-fin/app-kit';
import type { Address, Hex } from 'viem';
import { formatUnits } from 'viem';
import { createCircleWalletsAdapter } from '@circle-fin/adapter-circle-wallets';
import { createViemAdapterFromPrivateKey } from '@circle-fin/adapter-viem-v2';

import type { TreasuryConfig } from '../config.js';
import type { TreasuryService } from './treasuryService.js';

export interface BridgeInput {
  /** Amount in the smallest unit of the native token (18 decimals on Arc), same convention as `SendRewardInput`. */
  amount: bigint;
  /** The supplier's registered destination address on `destinationChain`. */
  recipientAddress: Address;
}

export type BridgeResult =
  | { status: 'complete'; destinationTxHash: Hex | undefined; explorerUrl: string | undefined }
  | { status: 'failed'; error: string };

/**
 * Routes treasury payouts across chains via Arc App Kit's `bridge()`, which
 * "abstracts the underlying CCTP flow so you can bridge without
 * orchestrating the low-level burn, attestation, and mint steps yourself"
 * (Arc docs). Only invoked when a supplier has registered a destination
 * wallet (`apps/backend`'s `/api/destination-wallet`) — otherwise the
 * existing same-chain `TreasuryService.sendReward` path is used unchanged.
 *
 * The destination is a wallet this agent doesn't control (the supplier's
 * own), so it uses App Kit's forwarder-only destination: Circle's Orbit
 * relayer fetches the attestation and submits the mint on the supplier's
 * behalf, no destination-side adapter needed.
 */
export class BridgeService {
  private readonly kit = new AppKit();

  constructor(
    private readonly sourceAdapter: ReturnType<
      typeof createCircleWalletsAdapter | typeof createViemAdapterFromPrivateKey
    >,
    private readonly sourceAddress: Address,
  ) {}

  async bridgeToDestination(input: BridgeInput): Promise<BridgeResult> {
    try {
      const result = await this.kit.bridge({
        from: {
          adapter: this.sourceAdapter,
          chain: BridgeChain.Arc_Testnet,
          address: this.sourceAddress,
        },
        to: {
          chain: BridgeChain.Ethereum_Sepolia,
          recipientAddress: input.recipientAddress,
          useForwarder: true,
        },
        amount: formatUnits(input.amount, 18),
      });

      if (result.state !== 'success') {
        return { status: 'failed', error: `Bridge ended in state "${result.state}"` };
      }

      const mintStep =
        result.steps.find((step) => step.name.toLowerCase() === 'mint') ?? result.steps.at(-1);
      return {
        status: 'complete',
        destinationTxHash: mintStep?.txHash as Hex | undefined,
        explorerUrl: mintStep?.explorerUrl,
      };
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * Builds the `BridgeService`, reusing the same treasury signer as
 * `TreasuryService` (Circle DCW or local viem key, matching `treasuryConfig.mode`)
 * so the bridge always moves funds from the same address the treasury balance
 * reflects.
 */
export async function createBridgeService(
  treasuryConfig: TreasuryConfig,
  treasuryService: TreasuryService,
): Promise<BridgeService> {
  const sourceAddress = await treasuryService.getAddress();

  const sourceAdapter =
    treasuryConfig.mode === 'circle'
      ? createCircleWalletsAdapter({
          apiKey: treasuryConfig.apiKey,
          entitySecret: treasuryConfig.entitySecret,
        })
      : createViemAdapterFromPrivateKey({ privateKey: treasuryConfig.privateKey });

  return new BridgeService(sourceAdapter, sourceAddress);
}
