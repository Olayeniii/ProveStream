import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import type { TokenBlockchain } from '@circle-fin/developer-controlled-wallets';
import type { Address, Hex } from 'viem';
import { formatEther, formatUnits } from 'viem';

import type { ChainConfig } from '../chainClient.js';
import { createAgentPublicClient, createAgentWalletClient } from '../chainClient.js';
import type { TreasuryConfig } from '../config.js';

export interface TreasuryBalance {
  amount: string;
  symbol: string;
}

export interface SendRewardInput {
  supplier: Address;
  /** Reward amount in the smallest unit of the native token (18 decimals on Arc). */
  amount: bigint;
  /** Client-provided reference, surfaced on Circle's dashboard/API for this transfer. */
  rewardId: string;
}

export interface SendRewardResult {
  txHash: Hex;
}

/**
 * Executes USDC settlement payments from the protocol treasury. Two
 * implementations share this interface: a real Circle Developer Controlled
 * Wallet, and a local viem-signed wallet for the demo when Circle credentials
 * aren't configured. Callers (the dispatcher) never need to know which one
 * they're talking to.
 */
export interface TreasuryService {
  getBalance(): Promise<TreasuryBalance>;
  sendReward(input: SendRewardInput): Promise<SendRewardResult>;
  /** The treasury's own on-chain address — used by `bridgeService.ts` as the CCTP source. */
  getAddress(): Promise<Address>;
}

/**
 * Treasury backed by a real Circle Developer Controlled Wallet on Arc. USDC is
 * Arc's native gas token, so a "USDC transfer" is a native-currency transfer:
 * `tokenAddress: ''` selects the native asset rather than an ERC-20.
 */
class CircleTreasuryService implements TreasuryService {
  private readonly client: ReturnType<typeof initiateDeveloperControlledWalletsClient>;
  private walletAddress: Address | undefined;

  constructor(private readonly config: Extract<TreasuryConfig, { mode: 'circle' }>) {
    this.client = initiateDeveloperControlledWalletsClient({
      apiKey: config.apiKey,
      entitySecret: config.entitySecret,
    });
  }

  /**
   * Resolves and caches the treasury wallet's on-chain address. `createTransaction`
   * only accepts a `blockchain` (needed to select the native USDC asset) alongside
   * `walletAddress`, not `walletId` — see the SDK's `CreateTransferTransactionInput`.
   */
  async getAddress(): Promise<Address> {
    if (this.walletAddress) {
      return this.walletAddress;
    }
    const response = await this.client.getWallet({ id: this.config.walletId });
    const address = response.data?.wallet?.address;
    if (!address) {
      throw new Error(`Could not resolve the address of treasury wallet ${this.config.walletId}.`);
    }
    this.walletAddress = address as Address;
    return this.walletAddress;
  }

  async getBalance(): Promise<TreasuryBalance> {
    const response = await this.client.getWalletTokenBalance({ id: this.config.walletId });
    const nativeBalance = response.data?.tokenBalances?.find(
      (balance) => !balance.token.tokenAddress,
    );
    return { amount: nativeBalance?.amount ?? '0', symbol: nativeBalance?.token.symbol ?? 'USDC' };
  }

  async sendReward({ supplier, amount, rewardId }: SendRewardInput): Promise<SendRewardResult> {
    const walletAddress = await this.getAddress();

    const created = await this.client.createTransaction({
      walletAddress,
      blockchain: this.config.blockchain as TokenBlockchain,
      destinationAddress: supplier,
      amount: [formatUnits(amount, 18)],
      refId: rewardId,
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
    });

    const transactionId = created.data?.id;
    if (!transactionId) {
      throw new Error('Circle did not return a transaction id for the reward payment.');
    }

    const result = await this.client.getTransaction({ id: transactionId, waitForTxHash: true });
    return { txHash: result.data.transaction.txHash as Hex };
  }
}

/**
 * Treasury backed by a local viem-signed account, used for the demo when no
 * Circle credentials are configured. Sends the native currency of the
 * configured chain directly — the same operation Circle's transfer performs
 * on Arc, since USDC there is the native asset.
 */
class LocalTreasuryService implements TreasuryService {
  private readonly walletClient: ReturnType<typeof createAgentWalletClient>;
  private readonly publicClient: ReturnType<typeof createAgentPublicClient>;

  constructor(chainConfig: ChainConfig, privateKey: Hex) {
    this.walletClient = createAgentWalletClient({ ...chainConfig, privateKey });
    this.publicClient = createAgentPublicClient(chainConfig);
  }

  async getBalance(): Promise<TreasuryBalance> {
    const balance = await this.publicClient.getBalance({
      address: this.walletClient.account.address,
    });
    return { amount: formatEther(balance), symbol: 'USDC (local demo)' };
  }

  getAddress(): Promise<Address> {
    return Promise.resolve(this.walletClient.account.address);
  }

  async sendReward({ supplier, amount }: SendRewardInput): Promise<SendRewardResult> {
    const txHash = await this.walletClient.sendTransaction({ to: supplier, value: amount });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }
}

/** Builds the configured `TreasuryService` implementation. */
export function createTreasuryService(
  chainConfig: ChainConfig,
  treasuryConfig: TreasuryConfig,
): TreasuryService {
  if (treasuryConfig.mode === 'circle') {
    return new CircleTreasuryService(treasuryConfig);
  }
  return new LocalTreasuryService(chainConfig, treasuryConfig.privateKey);
}
