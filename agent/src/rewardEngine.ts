import type { AttestationSubmittedEventArgs } from '@provenance-streams/protocol';

export interface RewardDecision {
  eligible: boolean;
  reason: string;
}

/**
 * Evaluates a submitted attestation against the reward policy rule.
 *
 * Milestone 1 rule: any attestation tied to a positive `policyId` is reward
 * eligible. This is intentionally simple — later milestones will replace it
 * with real policy lookups and payout sizing, without changing the shape of
 * `RewardDecision` that callers depend on.
 */
export function evaluateReward(attestation: AttestationSubmittedEventArgs): RewardDecision {
  const policyId = attestation.policyId ?? 0n;

  if (policyId > 0n) {
    return { eligible: true, reason: 'Reward Eligible' };
  }

  return { eligible: false, reason: `Policy ${policyId.toString()} is not reward eligible` };
}
