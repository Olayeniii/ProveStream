import { attestationRegistryAbi, rewardDispatcherAbi } from '@provenance-streams/protocol';
import type { Address, Hex } from 'viem';
import { createPublicClient, decodeFunctionData, http } from 'viem';

import { withRpcRetries } from './rpcRetry.js';

// Comfortably under the 10,000-block range many public RPC providers (including
// Arc testnet's) enforce per `eth_getLogs` call — same limit `PolicyService` works around.
const LOG_SCAN_CHUNK_BLOCKS = 9_000n;

export interface HistoryServiceConfig {
  rpcUrl: string;
  attestationRegistryAddress: Address;
  rewardDispatcherAddress: Address;
  attestationRegistryDeployedAtBlock: bigint;
  rewardDispatcherDeployedAtBlock: bigint;
}

export interface HistoricalAttestation {
  id: string;
  supplier: Address;
  auditor: Address;
  policyId: string;
  observedAt: string;
}

export interface HistoricalReward {
  rewardId: string;
  /** Recovered by decoding the `dispatchReward` call that produced this event; `undefined` only if that lookup fails. */
  attestationId: string | undefined;
  supplier: Address;
  policyId: string;
  rewardAmount: string;
  observedAt: string;
}

/**
 * Reconstructs attestation and reward-eligibility history directly from
 * chain logs, so the `Store`'s in-memory read models survive a backend
 * restart. This is deliberately read-only: it populates the dashboards'
 * history, but never re-enters `runAgent`'s action-taking pipeline (fraud
 * check, settlement queue, treasury payout) — replaying a historical
 * `RewardEligible` through that path would risk a duplicate real payment,
 * since (unlike `dispatchReward`, which the contract itself guards against
 * replay via `AlreadyDispatched`) the actual USDC transfer has no on-chain
 * idempotency check at all.
 *
 * A real limitation this can't paper over: whether a historical reward
 * actually *settled* isn't recoverable from chain at all — settlement is an
 * off-chain treasury transfer with no on-chain record. Backfilled rewards
 * are therefore surfaced with `status: 'pending'`, honestly meaning "no
 * completion evidence available", not a claim that it's still awaiting
 * payment. Fixing this for real needs a persistent store the agent itself
 * writes settlement outcomes to, not just a smarter backfill.
 */
export class HistoryService {
  private readonly client;

  constructor(private readonly config: HistoryServiceConfig) {
    this.client = createPublicClient({ transport: http(config.rpcUrl) });
  }

  async listHistoricalAttestations(): Promise<HistoricalAttestation[]> {
    const logs = await this.scanAttestationSubmittedLogs();
    const blockTimestamps = await this.blockTimestamps(logs.map((log) => log.blockNumber));

    const attestations: HistoricalAttestation[] = [];
    for (const log of logs) {
      if (
        log.args.id === undefined ||
        log.args.supplier === undefined ||
        log.args.auditor === undefined
      ) {
        continue;
      }
      attestations.push({
        id: log.args.id.toString(),
        supplier: log.args.supplier,
        auditor: log.args.auditor,
        policyId: (log.args.policyId ?? 0n).toString(),
        observedAt: blockTimestamps.get(log.blockNumber) ?? new Date().toISOString(),
      });
    }
    return attestations;
  }

  async listHistoricalRewards(): Promise<HistoricalReward[]> {
    const logs = await this.scanRewardEligibleLogs();
    const blockTimestamps = await this.blockTimestamps(logs.map((log) => log.blockNumber));

    const rewards: HistoricalReward[] = [];
    for (const log of logs) {
      if (
        log.args.rewardId === undefined ||
        log.args.supplier === undefined ||
        log.args.rewardAmount === undefined
      ) {
        continue;
      }
      rewards.push({
        rewardId: log.args.rewardId.toString(),
        attestationId: await this.recoverAttestationId(log.transactionHash),
        supplier: log.args.supplier,
        policyId: (log.args.policyId ?? 0n).toString(),
        rewardAmount: log.args.rewardAmount.toString(),
        observedAt: blockTimestamps.get(log.blockNumber) ?? new Date().toISOString(),
      });
    }
    return rewards;
  }

  /** Decodes the `dispatchReward(attestationId)` call that produced `txHash`, recovering the attestation id `RewardEligible` doesn't itself carry. */
  private async recoverAttestationId(txHash: Hex): Promise<string | undefined> {
    try {
      const tx = await withRpcRetries(() => this.client.getTransaction({ hash: txHash }));
      const decoded = decodeFunctionData({ abi: rewardDispatcherAbi, data: tx.input });
      return decoded.functionName === 'dispatchReward' ? decoded.args[0].toString() : undefined;
    } catch {
      return undefined;
    }
  }

  private async blockTimestamps(blockNumbers: bigint[]): Promise<Map<bigint, string>> {
    const unique = [...new Set(blockNumbers)];
    const entries = await Promise.all(
      unique.map(async (blockNumber) => {
        const block = await withRpcRetries(() => this.client.getBlock({ blockNumber }));
        return [blockNumber, new Date(Number(block.timestamp) * 1000).toISOString()] as const;
      }),
    );
    return new Map(entries);
  }

  private async scanAttestationSubmittedLogs() {
    const latestBlock = await withRpcRetries(() => this.client.getBlockNumber());
    const logs = [];
    for (
      let start = this.config.attestationRegistryDeployedAtBlock;
      start <= latestBlock;
      start += LOG_SCAN_CHUNK_BLOCKS
    ) {
      const end =
        start + LOG_SCAN_CHUNK_BLOCKS - 1n > latestBlock
          ? latestBlock
          : start + LOG_SCAN_CHUNK_BLOCKS - 1n;
      const chunk = await withRpcRetries(() =>
        this.client.getContractEvents({
          address: this.config.attestationRegistryAddress,
          abi: attestationRegistryAbi,
          eventName: 'AttestationSubmitted',
          fromBlock: start,
          toBlock: end,
        }),
      );
      logs.push(...chunk);
    }
    return logs;
  }

  private async scanRewardEligibleLogs() {
    const latestBlock = await withRpcRetries(() => this.client.getBlockNumber());
    const logs = [];
    for (
      let start = this.config.rewardDispatcherDeployedAtBlock;
      start <= latestBlock;
      start += LOG_SCAN_CHUNK_BLOCKS
    ) {
      const end =
        start + LOG_SCAN_CHUNK_BLOCKS - 1n > latestBlock
          ? latestBlock
          : start + LOG_SCAN_CHUNK_BLOCKS - 1n;
      const chunk = await withRpcRetries(() =>
        this.client.getContractEvents({
          address: this.config.rewardDispatcherAddress,
          abi: rewardDispatcherAbi,
          eventName: 'RewardEligible',
          fromBlock: start,
          toBlock: end,
        }),
      );
      logs.push(...chunk);
    }
    return logs;
  }
}
