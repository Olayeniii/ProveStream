import { describe, expect, it } from 'vitest';

import { evaluateReward } from './rewardEngine.js';

function attestation(policyId: bigint) {
  return {
    id: 1n,
    supplier: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const,
    auditor: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const,
    policyId,
  };
}

describe('evaluateReward', () => {
  it('is eligible when policyId is positive', () => {
    const decision = evaluateReward(attestation(1n));

    expect(decision.eligible).toBe(true);
    expect(decision.reason).toBe('Reward Eligible');
  });

  it('is not eligible when policyId is zero', () => {
    const decision = evaluateReward(attestation(0n));

    expect(decision.eligible).toBe(false);
  });
});
