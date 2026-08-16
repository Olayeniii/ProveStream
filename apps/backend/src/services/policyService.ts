import { createLogger } from '@provenance-streams/logger';
import { decodeCredentialType, rewardPolicyAbi } from '@provenance-streams/protocol';
import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';

import { summarizeRpcError, withRpcRetries } from './rpcRetry.js';

const logger = createLogger('policyService');

export interface PolicySummary {
  id: string;
  credentialType: string;
  rewardAmount: string;
  enabled: boolean;
  createdAt: string;
}

export interface PolicyServiceConfig {
  rpcUrl: string;
  rewardPolicyAddress: Address;
  /** Block to start scanning `PolicyCreated` logs from — the contract's deployment block on a fresh start, or one block past a previously persisted `scannedThroughBlock` (see `getScanProgress()`) to resume an interrupted scan without re-covering ground already paid for in RPC calls. */
  fromBlock?: bigint;
  /** Policy ids already known from a previous run's persisted scan progress — `listPolicies()` always re-reads their *current* state fresh via `getPolicy`, this just saves re-discovering the id itself via `eth_getLogs`. */
  knownIds?: string[] | undefined;
}

// Comfortably under the 10,000-block range many public RPC providers (including
// Arc testnet's) enforce per `eth_getLogs` call.
const LOG_SCAN_CHUNK_BLOCKS = 9_000n;

/**
 * Reads `RewardPolicy` for the admin dashboard. `RewardPolicy.sol` only
 * exposes `getPolicy(id)` (per spec, to keep the contract minimal) so the
 * list of known policy ids comes from `PolicyCreated` event history, then
 * each id's current state is re-read from the contract — the enabled/reward
 * amount shown is always current, even if it's since been updated or
 * disabled.
 *
 * The log scan is incremental and resumable: it never re-scans a block range
 * it already covered (tracked in `scannedThroughBlock`, seeded from
 * `config.fromBlock` and advanced — and, on a rate limit, *not* rewound — by
 * every call to `listPolicies()`). Arc testnet's public RPC rate-limits
 * `eth_getLogs` more tightly than its documented 10,000-block-per-call cap
 * suggests; a chunk that fails after retries just stops the scan for *this*
 * call rather than throwing, so a caller always gets the ids discovered so
 * far (merged with whatever was already known) instead of a hard failure —
 * the next call picks up exactly where this one left off.
 */
// How long a successful `readPolicy` result is trusted before re-reading it
// from chain. Policy state barely changes (only `updatePolicy`/`disablePolicy`,
// both rare admin actions) but `listPolicies()` gets called on every page
// load/poll — without this, every single call re-reads every known policy
// from a rate-limited RPC, which is what made this endpoint able to hang for
// 30s+ under load in the first place.
const POLICY_CACHE_TTL_MS = 30_000;

export class PolicyService {
  private readonly client;
  private readonly knownIds: Set<bigint>;
  private scannedThroughBlock: bigint;
  private readonly policyCache = new Map<string, { policy: PolicySummary; fetchedAt: number }>();

  constructor(private readonly config: PolicyServiceConfig) {
    this.client = createPublicClient({ transport: http(config.rpcUrl) });
    this.knownIds = new Set((config.knownIds ?? []).map((id) => BigInt(id)));
    this.scannedThroughBlock = (config.fromBlock ?? 0n) - 1n;
  }

  /**
   * Never lets a single struggling policy read (or the log scan itself)
   * block or fail the whole response — each read is isolated, and a policy
   * that can't be freshly read right now just falls back to its last known
   * good value instead of taking every other policy down with it.
   */
  async listPolicies(): Promise<PolicySummary[]> {
    try {
      await this.scanNewPolicyCreatedLogs();
    } catch (error) {
      logger.error(`log scan failed, serving known ids only: ${summarizeRpcError(error)}`);
    }

    const policies = await Promise.all(
      [...this.knownIds].map((id) => this.readPolicyCached(id)),
    );

    return policies.filter((policy): policy is PolicySummary => policy !== undefined).sort(
      (a, b) => Number(b.id) - Number(a.id),
    );
  }

  /**
   * Fast path for a policy the caller just created and already knows the id of (e.g.
   * from decoding its own `PolicyCreated` receipt) — reads it directly instead of
   * waiting for `scanNewPolicyCreatedLogs()`'s incremental backfill to reach the block
   * it was created in, which can lag far behind the chain tip under RPC rate limiting.
   */
  async registerKnownPolicy(id: bigint): Promise<PolicySummary> {
    const policy = await this.readPolicy(id);
    this.policyCache.set(id.toString(), { policy, fetchedAt: Date.now() });
    this.knownIds.add(id);
    return policy;
  }

  /**
   * Serves a cached policy if it's still fresh; otherwise tries a real read
   * and falls back to a stale cached value (rather than failing outright) if
   * that read fails. Only returns `undefined` for a policy that has never
   * once been successfully read — everything else degrades gracefully.
   */
  private async readPolicyCached(id: bigint): Promise<PolicySummary | undefined> {
    const key = id.toString();
    const cached = this.policyCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < POLICY_CACHE_TTL_MS) {
      return cached.policy;
    }
    try {
      const policy = await this.readPolicy(id);
      this.policyCache.set(key, { policy, fetchedAt: Date.now() });
      return policy;
    } catch (error) {
      if (cached) {
        logger.error(
          `re-read of policy ${key} failed, serving stale cached value: ${summarizeRpcError(error)}`,
        );
        return cached.policy;
      }
      logger.error(`read of policy ${key} failed with no cached fallback: ${summarizeRpcError(error)}`);
      return undefined;
    }
  }

  private async readPolicy(id: bigint): Promise<PolicySummary> {
    const policy = await withRpcRetries(() =>
      this.client.readContract({
        address: this.config.rewardPolicyAddress,
        abi: rewardPolicyAbi,
        functionName: 'getPolicy',
        args: [id],
      }),
    );
    return {
      id: policy.id.toString(),
      credentialType: decodeCredentialType(policy.credentialType),
      rewardAmount: policy.rewardAmount.toString(),
      enabled: policy.enabled,
      createdAt: new Date(Number(policy.createdAt) * 1000).toISOString(),
    };
  }

  /** Snapshot of scan progress worth persisting across restarts — see `db/repositories/chainScanProgressRepo.ts`. */
  getScanProgress(): { knownIds: string[]; scannedThroughBlock: string } {
    return {
      knownIds: [...this.knownIds].map((id) => id.toString()),
      scannedThroughBlock: this.scannedThroughBlock.toString(),
    };
  }

  /**
   * Walks forward from `scannedThroughBlock + 1` to the chain tip in chunks,
   * adding any newly discovered policy ids to `knownIds`. Stops (without
   * throwing) at the first chunk that still fails after `withRpcRetries`
   * exhausts its attempts, leaving `scannedThroughBlock` at the last chunk
   * that actually succeeded.
   */
  private async scanNewPolicyCreatedLogs(): Promise<void> {
    const latestBlock = await withRpcRetries(() => this.client.getBlockNumber());

    for (
      let start = this.scannedThroughBlock + 1n;
      start <= latestBlock;
      start += LOG_SCAN_CHUNK_BLOCKS
    ) {
      const end =
        start + LOG_SCAN_CHUNK_BLOCKS - 1n > latestBlock
          ? latestBlock
          : start + LOG_SCAN_CHUNK_BLOCKS - 1n;
      let chunk;
      try {
        chunk = await withRpcRetries(() =>
          this.client.getContractEvents({
            address: this.config.rewardPolicyAddress,
            abi: rewardPolicyAbi,
            eventName: 'PolicyCreated',
            fromBlock: start,
            toBlock: end,
          }),
        );
      } catch (error) {
        logger.error(
          `stopped scanning at block ${start.toString()} (resumes here next call): ${summarizeRpcError(error)}`,
        );
        return;
      }
      for (const log of chunk) {
        if (log.args.id !== undefined) {
          this.knownIds.add(log.args.id);
        }
      }
      this.scannedThroughBlock = end;
    }
  }
}
