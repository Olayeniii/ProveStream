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
  /** Block to resume the `AttestationSubmitted` scan from — the contract's deployment block on a fresh start, or one past a previously persisted `scannedThroughBlock`. */
  attestationRegistryFromBlock: bigint;
  /** Same idea as above, for the `RewardEligible` scan. */
  rewardDispatcherFromBlock: bigint;
}

export interface HistoricalAttestation {
  id: string;
  supplier: Address;
  auditor: Address;
  policyId: string;
  observedAt: string;
  transactionHash: Hex;
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

export interface AttestationBackfillResult {
  attestations: HistoricalAttestation[];
  /** Persist this and pass it back as `attestationRegistryFromBlock + 1` next run — see `PolicyService` for the same pattern. */
  scannedThroughBlock: bigint;
}

export interface RewardBackfillResult {
  rewards: HistoricalReward[];
  scannedThroughBlock: bigint;
}

/** Loosely-typed shape `scanLogs` returns for either event — see its docstring for why. */
interface ScannedLog {
  args: {
    id?: bigint;
    supplier?: Address;
    auditor?: Address;
    policyId?: bigint;
    rewardId?: bigint;
    rewardAmount?: bigint;
  };
  blockNumber: bigint;
  transactionHash: Hex;
}

/**
 * Reconstructs attestation and reward-eligibility history directly from
 * chain logs, so the `Store`'s read models survive a backend restart. This
 * is deliberately read-only: it populates the dashboards' history, but never
 * re-enters `runAgent`'s action-taking pipeline (fraud check, settlement
 * queue, treasury payout) — replaying a historical `RewardEligible` through
 * that path would risk a duplicate real payment, since (unlike
 * `dispatchReward`, which the contract itself guards against replay via
 * `AlreadyDispatched`) the actual USDC transfer has no on-chain idempotency
 * check at all.
 *
 * Like `PolicyService`, each scan is incremental and resumable rather than
 * an all-or-nothing pass from the contract's deployment block: on a chunk
 * that still fails after `withRpcRetries` exhausts its attempts (Arc
 * testnet's public RPC rate-limits harder than its per-call block-range cap
 * alone suggests), it stops and returns whatever it found plus the block it
 * got to, instead of throwing — the caller persists that progress
 * (`snapshotStore.ts`) and resumes from there on the next call, so repeated
 * restarts converge on full history instead of each one re-paying the same
 * RPC cost and none of them finishing.
 *
 * A real limitation this can't paper over: whether a historical reward
 * actually *settled* isn't recoverable from chain at all — settlement is an
 * off-chain treasury transfer with no on-chain record. Backfilled rewards
 * are therefore surfaced with `status: 'pending'`, honestly meaning "no
 * completion evidence available", not a claim that it's still awaiting
 * payment.
 */
export class HistoryService {
  private readonly client;

  constructor(private readonly config: HistoryServiceConfig) {
    this.client = createPublicClient({ transport: http(config.rpcUrl) });
  }

  async listHistoricalAttestations(): Promise<AttestationBackfillResult> {
    const { logs, scannedThroughBlock } = await this.scanLogs({
      address: this.config.attestationRegistryAddress,
      abi: attestationRegistryAbi,
      eventName: 'AttestationSubmitted',
      fromBlock: this.config.attestationRegistryFromBlock,
    });
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
        transactionHash: log.transactionHash,
        policyId: (log.args.policyId ?? 0n).toString(),
        observedAt: blockTimestamps.get(log.blockNumber) ?? new Date().toISOString(),
      });
    }
    return { attestations, scannedThroughBlock };
  }

  async listHistoricalRewards(): Promise<RewardBackfillResult> {
    const { logs, scannedThroughBlock } = await this.scanLogs({
      address: this.config.rewardDispatcherAddress,
      abi: rewardDispatcherAbi,
      eventName: 'RewardEligible',
      fromBlock: this.config.rewardDispatcherFromBlock,
    });
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
    return { rewards, scannedThroughBlock };
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

  /**
   * Shared chunked-scan loop for both event types. Deliberately loosely
   * typed at this internal layer (each `log.args.*` field is read back with
   * an explicit `undefined` check in the two public methods above, which is
   * where real type safety matters) rather than fighting TS overloads for a
   * union of two unrelated ABIs.
   */
  private async scanLogs(params: {
    address: Address;
    abi: typeof attestationRegistryAbi | typeof rewardDispatcherAbi;
    eventName: 'AttestationSubmitted' | 'RewardEligible';
    fromBlock: bigint;
  }): Promise<{
    logs: ScannedLog[];
    scannedThroughBlock: bigint;
  }> {
    const latestBlock = await withRpcRetries(() => this.client.getBlockNumber());

    const logs: ScannedLog[] = [];
    let scannedThroughBlock = params.fromBlock - 1n;
    for (let start = params.fromBlock; start <= latestBlock; start += LOG_SCAN_CHUNK_BLOCKS) {
      const end =
        start + LOG_SCAN_CHUNK_BLOCKS - 1n > latestBlock
          ? latestBlock
          : start + LOG_SCAN_CHUNK_BLOCKS - 1n;
      let chunk;
      try {
        chunk = await withRpcRetries(() =>
          this.client.getContractEvents({
            address: params.address,
            abi: params.abi,
            eventName: params.eventName,
            fromBlock: start,
            toBlock: end,
          }),
        );
      } catch (error) {
        console.error(
          `HistoryService: stopped scanning ${params.eventName} at block ${start.toString()} (resumes here next run):`,
          error,
        );
        break;
      }
      logs.push(...(chunk as unknown as ScannedLog[]));
      scannedThroughBlock = end;
    }
    return { logs, scannedThroughBlock };
  }
}
