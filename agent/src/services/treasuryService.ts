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
 * A full `eth_signTypedData_v4`-shaped EIP-712 payload — `types` includes
 * `EIP712Domain` per that standard's raw JSON format, since Circle's signing
 * API expects exactly this as a JSON string. `LocalTreasuryService` strips
 * it back out before handing the rest to viem, which infers the domain type
 * itself and rejects an explicit `EIP712Domain` entry.
 *
 * `chainId`/`verifyingContract` are optional: Circle Gateway's `GatewayWallet`
 * deliberately omits both from its domain (verified on-chain against the real
 * contract's `domainSeparator()`) so a signature is valid across every domain
 * it supports, not tied to one chain/contract — unlike the plain EIP-3009
 * `transferWithAuthorization` domain, which needs both. Callers must omit the
 * keys entirely (not set them to `undefined`) when the domain doesn't use them,
 * so `EIP712Domain`'s type entry and the actual signed struct hash agree.
 */
export interface TypedDataInput {
  domain: { name: string; version: string; chainId?: number; verifyingContract?: Address };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
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
  /** Signs an EIP-712 payload with the treasury's own key — used by `x402Service.ts` for gasless `transferWithAuthorization` claims. */
  signTypedData(input: TypedDataInput): Promise<Hex>;
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

  async signTypedData(input: TypedDataInput): Promise<Hex> {
    const walletAddress = await this.getAddress();
    const response = await this.client.signTypedData({
      walletAddress,
      blockchain: this.config.blockchain,
      data: JSON.stringify(input),
    });
    const signature = response.data?.signature;
    if (!signature) {
      throw new Error('Circle did not return a signature for the typed-data request.');
    }
    return signature as Hex;
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

  /** `EIP712Domain` is dropped from `types` — viem infers it from `domain` and rejects an explicit entry. */
  signTypedData({ domain, types, primaryType, message }: TypedDataInput): Promise<Hex> {
    const remainingTypes = { ...types };
    delete remainingTypes.EIP712Domain;
    return this.walletClient.signTypedData({
      account: this.walletClient.account,
      domain,
      types: remainingTypes,
      primaryType,
      message,
    });
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
