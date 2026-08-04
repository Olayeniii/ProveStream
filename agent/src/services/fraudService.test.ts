import { describe, expect, it } from 'vitest';

import { FraudService } from './fraudService.js';

const SUPPLIER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
const OTHER_SUPPLIER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

function input(overrides: Partial<Parameters<FraudService['check']>[0]> = {}) {
  return {
    attestationId: 1n,
    supplier: SUPPLIER,
    policyId: 1n,
    rewardAmount: 100n,
    ...overrides,
  };
}

describe('FraudService', () => {
  it('flags a brand-new supplier only with the low first-time-supplier signal, below threshold', () => {
    const service = new FraudService();
    const result = service.check(input());

    expect(result.flagged).toBe(false);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]?.reason).toContain('First submission');
    expect(result.score).toBe(10);
  });

  it("does not flag a second submission from a different supplier using the first one's history", () => {
    const service = new FraudService();
    service.check(input({ supplier: SUPPLIER }));
    const result = service.check(input({ supplier: OTHER_SUPPLIER }));

    expect(result.flagged).toBe(false);
    expect(
      result.signals.some((signal) => signal.reason.includes('attestations from this supplier')),
    ).toBe(false);
  });

  it('flags repeated submissions from the same supplier within the rolling window', () => {
    const service = new FraudService();
    const now = Date.now();

    service.check(input(), now);
    service.check(input(), now + 1_000);
    service.check(input(), now + 2_000);
    const result = service.check(input(), now + 3_000);

    expect(
      result.signals.some((signal) => signal.reason.includes('attestations from this supplier')),
    ).toBe(true);
  });

  it('ignores submissions outside the rolling window when counting frequency', () => {
    const service = new FraudService({ windowMs: 1_000 });
    const now = Date.now();

    service.check(input(), now);
    service.check(input(), now + 500);
    // Far outside the 1s window relative to the earlier calls.
    const result = service.check(input(), now + 10_000);

    expect(
      result.signals.some((signal) => signal.reason.includes('attestations from this supplier')),
    ).toBe(false);
  });

  it('flags repeated claims of the same policy by the same supplier', () => {
    const service = new FraudService();

    service.check(input({ policyId: 5n }));
    service.check(input({ policyId: 5n }));
    const result = service.check(input({ policyId: 5n }));

    expect(result.signals.some((signal) => signal.reason.includes('claimed policy #5'))).toBe(true);
  });

  it('records payouts and factors payout frequency into later checks', () => {
    const service = new FraudService();
    const now = Date.now();

    service.recordPayout(SUPPLIER, now);
    service.recordPayout(SUPPLIER, now + 1_000);
    service.recordPayout(SUPPLIER, now + 2_000);
    const result = service.check(input(), now + 3_000);

    expect(
      result.signals.some((signal) => signal.reason.includes('payouts to this supplier')),
    ).toBe(true);
  });

  it('flags when the accumulated score reaches the configured threshold', () => {
    const service = new FraudService({ scoreThreshold: 10 });
    const result = service.check(input());

    // First-time-supplier alone contributes 10 points, meeting a threshold of 10.
    expect(result.score).toBeGreaterThanOrEqual(10);
    expect(result.flagged).toBe(true);
  });

  it('caps the total score at 100 even when many signals fire', () => {
    const service = new FraudService();
    const now = Date.now();

    for (let i = 0; i < 6; i++) {
      service.check(input({ policyId: 9n }), now + i * 1_000);
    }
    const result = service.check(input({ policyId: 9n }), now + 6_000);

    expect(result.score).toBeLessThanOrEqual(100);
  });
});
