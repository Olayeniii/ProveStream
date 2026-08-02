import { decodeCredentialType, rewardPolicyAbi } from '@provenance-streams/protocol';
import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';

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
}

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
    const logs = await this.client.getContractEvents({
      address: this.config.rewardPolicyAddress,
      abi: rewardPolicyAbi,
      eventName: 'PolicyCreated',
      fromBlock: 0n,
      toBlock: 'latest',
    });

    const ids = [
      ...new Set(logs.map((log) => log.args.id).filter((id): id is bigint => id !== undefined)),
    ];

    const policies = await Promise.all(
      ids.map(async (id) => {
        const policy = await this.client.readContract({
          address: this.config.rewardPolicyAddress,
          abi: rewardPolicyAbi,
          functionName: 'getPolicy',
          args: [id],
        });
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
}
