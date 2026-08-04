import type {
  AgentHealth,
  DestinationWallet,
  FraudAlert,
  FraudAlertStatus,
  Payment,
  PaymentStatus,
  RiskAnalysis,
  RiskAnalysisStatus,
  SettlementJobRecord,
  SettlementJobState,
} from '@provenance-streams/protocol';
import type { Address, Hex } from 'viem';

export interface AttestationRecord {
  id: string;
  supplier: Address;
  auditor: Address;
  policyId: string;
  observedAt: string;
}

const MAX_RECORDS = 200;

/**
 * In-memory read models for the dashboards, populated by the agent's hooks as
 * it observes on-chain events. This is a demo-scale substitute for a database:
 * it resets on restart and isn't shared across processes. Swapping in a real
 * store later only touches this file — `runAgent`'s hooks and the HTTP routes
 * that read from `Store` stay the same.
 */
export class Store {
  private readonly attestations: AttestationRecord[] = [];
  private readonly attestationIds = new Set<string>();
  private readonly payments = new Map<string, Payment>();
  private readonly pendingEvidence = new Map<Hex, string>();
  private readonly riskAnalyses = new Map<string, RiskAnalysis>();
  private readonly destinationWallets = new Map<Address, DestinationWallet>();
  private readonly fraudAlerts = new Map<string, FraudAlert>();
  private readonly settlementJobs = new Map<string, SettlementJobRecord>();
  private lastEventAt: string | undefined;
  private treasuryMode = 'local';

  /**
   * Idempotent by `id`: both the live watcher and `HistoryService`'s startup
   * backfill can observe the same attestation in the small window where
   * their block ranges overlap, and this makes calling it twice a no-op
   * rather than a duplicate dashboard row.
   */
  addAttestation(record: AttestationRecord): void {
    if (this.attestationIds.has(record.id)) {
      return;
    }
    this.attestationIds.add(record.id);
    this.attestations.unshift(record);
    this.attestations.length = Math.min(this.attestations.length, MAX_RECORDS);
    this.lastEventAt = new Date().toISOString();
  }

  listAttestations(): AttestationRecord[] {
    return this.attestations;
  }

  createPendingPayment(input: {
    rewardId: string;
    attestationId: string;
    supplier: Address;
    policyId: string;
    rewardAmount: string;
  }): void {
    const now = new Date().toISOString();
    this.payments.set(input.rewardId, {
      rewardId: input.rewardId,
      attestationId: input.attestationId,
      supplier: input.supplier,
      policyId: input.policyId,
      rewardAmount: input.rewardAmount,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    this.lastEventAt = now;
  }

  updatePaymentStatus(
    rewardId: string,
    status: PaymentStatus,
    extra?: {
      txHash?: Hex;
      error?: string;
      bridged?: boolean | undefined;
      destinationChain?: string | undefined;
      destinationTxHash?: Hex;
    },
  ): void {
    const payment = this.payments.get(rewardId);
    if (!payment) {
      return;
    }
    payment.status = status;
    payment.updatedAt = new Date().toISOString();
    if (extra?.txHash) {
      payment.txHash = extra.txHash;
    }
    if (extra?.error) {
      payment.error = extra.error;
    }
    if (extra?.bridged) {
      payment.bridged = extra.bridged;
    }
    if (extra?.destinationChain) {
      payment.destinationChain = extra.destinationChain;
    }
    if (extra?.destinationTxHash) {
      payment.destinationTxHash = extra.destinationTxHash;
    }
  }

  listPayments(): Payment[] {
    return [...this.payments.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Stores an attestation's plaintext evidence, keyed by the hash the frontend already computed. */
  addPendingEvidence(proofHash: Hex, evidenceText: string): void {
    this.pendingEvidence.set(proofHash, evidenceText);
  }

  /** Consumes (removes) the evidence text stored for `proofHash`, if any was submitted. */
  takePendingEvidence(proofHash: Hex): string | undefined {
    const evidenceText = this.pendingEvidence.get(proofHash);
    this.pendingEvidence.delete(proofHash);
    return evidenceText;
  }

  createPendingRiskAnalysis(attestationId: string): void {
    const now = new Date().toISOString();
    this.riskAnalyses.set(attestationId, {
      attestationId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }

  updateRiskAnalysisStatus(
    attestationId: string,
    status: RiskAnalysisStatus,
    extra?: { score?: number; confidence?: number; summary?: string; error?: string },
  ): void {
    const analysis = this.riskAnalyses.get(attestationId);
    if (!analysis) {
      return;
    }
    analysis.status = status;
    analysis.updatedAt = new Date().toISOString();
    if (extra?.score !== undefined) {
      analysis.score = extra.score;
    }
    if (extra?.confidence !== undefined) {
      analysis.confidence = extra.confidence;
    }
    if (extra?.summary) {
      analysis.summary = extra.summary;
    }
    if (extra?.error) {
      analysis.error = extra.error;
    }
  }

  listRiskAnalyses(): RiskAnalysis[] {
    return [...this.riskAnalyses.values()];
  }

  setTreasuryMode(mode: string): void {
    this.treasuryMode = mode;
  }

  registerDestinationWallet(input: {
    supplier: Address;
    chain: string;
    address: Address;
  }): DestinationWallet {
    const record: DestinationWallet = { ...input, registeredAt: new Date().toISOString() };
    this.destinationWallets.set(input.supplier, record);
    return record;
  }

  getDestinationWallet(supplier: Address): DestinationWallet | undefined {
    return this.destinationWallets.get(supplier);
  }

  createFraudAlert(input: {
    rewardId: string;
    attestationId: string;
    supplier: Address;
    policyId: string;
    rewardAmount: string;
    score: number;
    reasons: string[];
  }): void {
    const now = new Date().toISOString();
    this.fraudAlerts.set(input.rewardId, {
      ...input,
      status: 'flagged',
      createdAt: now,
      updatedAt: now,
    });
  }

  getFraudAlert(rewardId: string): FraudAlert | undefined {
    return this.fraudAlerts.get(rewardId);
  }

  updateFraudAlertStatus(rewardId: string, status: FraudAlertStatus): void {
    const alert = this.fraudAlerts.get(rewardId);
    if (!alert) {
      return;
    }
    alert.status = status;
    alert.updatedAt = new Date().toISOString();
  }

  listFraudAlerts(): FraudAlert[] {
    return [...this.fraudAlerts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  updateSettlementJobState(
    rewardId: string,
    state: SettlementJobState,
    extra?: { attempt?: number | undefined; error?: string | undefined },
  ): void {
    this.settlementJobs.set(rewardId, {
      rewardId,
      state,
      attempt: extra?.attempt,
      error: extra?.error,
      updatedAt: new Date().toISOString(),
    });
  }

  listSettlementJobs(): SettlementJobRecord[] {
    return [...this.settlementJobs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getAgentHealth(): AgentHealth {
    return {
      queueDepth: [...this.settlementJobs.values()].filter(
        (job) => job.state === 'queued' || job.state === 'processing' || job.state === 'retrying',
      ).length,
      treasuryMode: this.treasuryMode,
      lastEventAt: this.lastEventAt,
      pendingFraudAlerts: [...this.fraudAlerts.values()].filter(
        (alert) => alert.status === 'flagged',
      ).length,
    };
  }
}
