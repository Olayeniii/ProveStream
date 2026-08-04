import { decodeCredentialType, rewardPolicyAbi } from '@provenance-streams/protocol';
import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';

import { withRpcRetries } from './rpcRetry.js';

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
  /** Block `RewardPolicy` was deployed at — scanning starts here instead of genesis. */
  deployedAtBlock?: bigint;
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
 */
export class PolicyService {
  private readonly client;

  constructor(private readonly config: PolicyServiceConfig) {
    this.client = createPublicClient({ transport: http(config.rpcUrl) });
  }

  async listPolicies(): Promise<PolicySummary[]> {
    const logs = await this.scanPolicyCreatedLogs();

    const ids = [
      ...new Set(logs.map((log) => log.args.id).filter((id): id is bigint => id !== undefined)),
    ];

    const policies = await Promise.all(
      ids.map(async (id) => {
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
      }),
    );

    return policies.sort((a, b) => Number(b.id) - Number(a.id));
  }

  /**
   * `eth_getLogs` is capped to a fixed block range on many providers (Arc
   * testnet included, at 10,000 blocks) — scanning `fromBlock: 0n` in one call
   * breaks the moment a chain has meaningful history. This walks the range in
   * chunks instead, starting from the contract's deployment block rather than
   * genesis.
   */
  private async scanPolicyCreatedLogs() {
    const fromBlock = this.config.deployedAtBlock ?? 0n;
    const latestBlock = await withRpcRetries(() => this.client.getBlockNumber());

    const logs = [];
    for (let start = fromBlock; start <= latestBlock; start += LOG_SCAN_CHUNK_BLOCKS) {
      const end =
        start + LOG_SCAN_CHUNK_BLOCKS - 1n > latestBlock
          ? latestBlock
          : start + LOG_SCAN_CHUNK_BLOCKS - 1n;
      const chunk = await withRpcRetries(() =>
        this.client.getContractEvents({
          address: this.config.rewardPolicyAddress,
          abi: rewardPolicyAbi,
          eventName: 'PolicyCreated',
          fromBlock: start,
          toBlock: end,
        }),
      );
      logs.push(...chunk);
    }
    return logs;
  }
}
