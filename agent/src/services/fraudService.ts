import type { Address } from 'viem';

export interface FraudCheckInput {
  attestationId: bigint;
  supplier: Address;
  policyId: bigint;
  rewardAmount: bigint;
}

export interface FraudSignal {
  reason: string;
  points: number;
}

export interface FraudCheckResult {
  /** 0-100, higher = riskier. */
  score: number;
  /** True once `score` crosses the configured threshold — the caller should hold the payout for review instead of auto-dispatching. */
  flagged: boolean;
  signals: FraudSignal[];
}

export interface FraudServiceConfig {
  /** Score at or above which a payout is flagged instead of auto-dispatched. */
  scoreThreshold: number;
  /** Rolling window used for the frequency-based checks below. */
  windowMs: number;
}

const DEFAULT_CONFIG: FraudServiceConfig = {
  scoreThreshold: 70,
  windowMs: 10 * 60 * 1000,
};

/**
 * Rule-based fraud/risk scoring, run before a reward is dispatched.
 *
 * Deliberately pattern-based on structured on-chain/agent-observed data
 * (submission frequency, payout frequency, policy reuse) — a complement to,
 * not a replacement for, the evidence-content-based Gemini risk analysis in
 * `apps/backend`, which reads the auditor's free-text evidence instead.
 *
 * State is in-memory only, scoped to this agent process's lifetime — the
 * same "demo-scale simplification" already used by `apps/backend`'s `Store`
 * (see `docs/decisions.md`). A restart resets the rolling history, which is
 * an acceptable tradeoff at this scale: it never *weakens* a check (a fresh
 * process just starts from "no history is suspicious" rather than false
 * positives from stale data).
 *
 * Duplicate proof hashes are **not** re-checked here: `AttestationRegistry`
 * already rejects them on-chain (`DuplicateProofHash`), so an
 * `AttestationSubmitted` event with a real duplicate can never reach this
 * service in the first place.
 */
export class FraudService {
  private readonly config: FraudServiceConfig;
  private readonly submissionsBySupplier = new Map<Address, number[]>();
  private readonly payoutsBySupplier = new Map<Address, number[]>();
  private readonly submissionsByPolicyPair = new Map<string, number>();
  private readonly knownSuppliers = new Set<Address>();

  constructor(config: Partial<FraudServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Scores `input` against the rolling history observed so far, then records
   * it into that history (so the *next* call sees this one). Call once per
   * `AttestationSubmitted` event, before deciding whether to dispatch.
   */
  check(input: FraudCheckInput, now: number = Date.now()): FraudCheckResult {
    const signals: FraudSignal[] = [];

    const recentSubmissions = this.recentTimestamps(this.submissionsBySupplier, input.supplier, now);
    if (recentSubmissions.length >= 3) {
      signals.push({
        reason: `${(recentSubmissions.length + 1).toString()} attestations from this supplier in the last ${(this.config.windowMs / 60_000).toString()} minutes`,
        points: Math.min(40, recentSubmissions.length * 10),
      });
    }

    const recentPayouts = this.recentTimestamps(this.payoutsBySupplier, input.supplier, now);
    if (recentPayouts.length >= 3) {
      signals.push({
        reason: `${recentPayouts.length.toString()} payouts to this supplier in the last ${(this.config.windowMs / 60_000).toString()} minutes`,
        points: Math.min(30, recentPayouts.length * 8),
      });
    }

    const policyPairKey = `${input.supplier}:${input.policyId.toString()}`;
    const priorPolicyClaims = this.submissionsByPolicyPair.get(policyPairKey) ?? 0;
    if (priorPolicyClaims >= 2) {
      signals.push({
        reason: `Supplier has claimed policy #${input.policyId.toString()} ${priorPolicyClaims.toString()} times already`,
        points: Math.min(30, (priorPolicyClaims - 1) * 10),
      });
    }

    const isFirstTimeSupplier = !this.knownSuppliers.has(input.supplier);
    if (isFirstTimeSupplier) {
      signals.push({ reason: 'First submission observed from this supplier', points: 10 });
    }

    // Record this submission into history for future checks.
    this.recordTimestamp(this.submissionsBySupplier, input.supplier, now);
    this.submissionsByPolicyPair.set(policyPairKey, priorPolicyClaims + 1);
    this.knownSuppliers.add(input.supplier);

    const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.points, 0));
    return { score, flagged: score >= this.config.scoreThreshold, signals };
  }

  /** Call once a payout for `supplier` actually settles, to feed the payout-frequency check above. */
  recordPayout(supplier: Address, now: number = Date.now()): void {
    this.recordTimestamp(this.payoutsBySupplier, supplier, now);
  }

  private recentTimestamps(store: Map<Address, number[]>, key: Address, now: number): number[] {
    const all = store.get(key) ?? [];
    return all.filter((timestamp) => now - timestamp <= this.config.windowMs);
  }

  private recordTimestamp(store: Map<Address, number[]>, key: Address, now: number): void {
    const existing = store.get(key) ?? [];
    const pruned = existing.filter((timestamp) => now - timestamp <= this.config.windowMs);
    pruned.push(now);
    store.set(key, pruned);
  }
}
