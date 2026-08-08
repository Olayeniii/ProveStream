import type {
  AgentHealth,
  DestinationWallet,
  EvidenceSubmission,
  FraudAlert,
  FraudAlertStatus,
  Payment,
  PaymentStatus,
  RiskAnalysis,
  RiskAnalysisStatus,
  SettlementJobRecord,
  SettlementJobState,
  SignatureVerification,
  SignatureVerificationStatus,
} from '@provenance-streams/protocol';
import type { Address, Hex } from 'viem';
import { keccak256, toHex } from 'viem';

export interface AttestationRecord {
  id: string;
  supplier: Address;
  auditor: Address;
  policyId: string;
  observedAt: string;
  /** The `submitAttestation` transaction that produced this record — kept so a restart can (re-)run signature verification without needing a fresh chain scan. */
  transactionHash: Hex;
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
  private readonly evidenceSubmissions = new Map<Hex, EvidenceSubmission>();
  private evidenceSubmissionSeq = 0;
  private readonly riskAnalyses = new Map<string, RiskAnalysis>();
  private readonly signatureVerifications = new Map<string, SignatureVerification>();
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

  /**
   * Records a supplier's submitted evidence, hashing it the same way
   * `AttestationRegistry` expects (`keccak256(toHex(evidenceText))`) so an
   * auditor's later "Attest" action can reuse this exact `proofHash` instead
   * of re-hashing. Duplicate proof hashes are already rejected on-chain, so
   * this can't collide across two genuinely different submissions — a retry
   * of the same text just overwrites its own still-pending record.
   */
  createEvidenceSubmission(input: {
    supplier: Address;
    policyId: string;
    evidenceText: string;
  }): EvidenceSubmission {
    const proofHash = keccak256(toHex(input.evidenceText));
    const now = new Date().toISOString();
    this.evidenceSubmissionSeq += 1;
    const record: EvidenceSubmission = {
      id: this.evidenceSubmissionSeq.toString(),
      supplier: input.supplier,
      policyId: input.policyId,
      proofHash,
      evidenceText: input.evidenceText,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.evidenceSubmissions.set(proofHash, record);
    return record;
  }

  /** Non-destructive — a submission stays queryable after an auditor attests to it. */
  getEvidenceSubmission(proofHash: Hex): EvidenceSubmission | undefined {
    return this.evidenceSubmissions.get(proofHash);
  }

  listEvidenceSubmissions(status?: EvidenceSubmission['status']): EvidenceSubmission[] {
    const all = [...this.evidenceSubmissions.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    return status ? all.filter((entry) => entry.status === status) : all;
  }

  markEvidenceAttested(proofHash: Hex, attestationId: string): void {
    const record = this.evidenceSubmissions.get(proofHash);
    if (!record || record.status !== 'pending') {
      return;
    }
    record.status = 'attested';
    record.attestationId = attestationId;
    record.updatedAt = new Date().toISOString();
  }

  markEvidenceRejected(proofHash: Hex): void {
    const record = this.evidenceSubmissions.get(proofHash);
    if (!record || record.status !== 'pending') {
      return;
    }
    record.status = 'rejected';
    record.updatedAt = new Date().toISOString();
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
    extra?: {
      score?: number;
      confidence?: number;
      summary?: string;
      provider?: string;
      error?: string;
    },
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
    if (extra?.provider) {
      analysis.provider = extra.provider;
    }
    if (extra?.error) {
      analysis.error = extra.error;
    }
  }

  listRiskAnalyses(): RiskAnalysis[] {
    return [...this.riskAnalyses.values()];
  }

  createPendingSignatureVerification(attestationId: string): void {
    const now = new Date().toISOString();
    this.signatureVerifications.set(attestationId, {
      attestationId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }

  updateSignatureVerificationStatus(
    attestationId: string,
    status: SignatureVerificationStatus,
    extra?: { signerAddress?: Address; verified?: boolean; error?: string },
  ): void {
    const record = this.signatureVerifications.get(attestationId);
    if (!record) {
      return;
    }
    record.status = status;
    record.updatedAt = new Date().toISOString();
    if (extra?.signerAddress) {
      record.signerAddress = extra.signerAddress;
    }
    if (extra?.verified !== undefined) {
      record.verified = extra.verified;
    }
    if (extra?.error) {
      record.error = extra.error;
    }
  }

  getSignatureVerification(attestationId: string): SignatureVerification | undefined {
    return this.signatureVerifications.get(attestationId);
  }

  listSignatureVerifications(): SignatureVerification[] {
    return [...this.signatureVerifications.values()];
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

  /** Plain-JSON view of everything worth surviving a restart — see `snapshotStore.ts`. */
  toSnapshotData(): {
    attestations: AttestationRecord[];
    payments: Payment[];
    fraudAlerts: FraudAlert[];
    settlementJobs: SettlementJobRecord[];
    destinationWallets: DestinationWallet[];
    evidenceSubmissions: EvidenceSubmission[];
  } {
    return {
      attestations: this.attestations,
      payments: [...this.payments.values()],
      fraudAlerts: [...this.fraudAlerts.values()],
      settlementJobs: [...this.settlementJobs.values()],
      destinationWallets: [...this.destinationWallets.values()],
      evidenceSubmissions: [...this.evidenceSubmissions.values()],
    };
  }

  /** Repopulates the store from a previous `toSnapshotData()` — call once, right after construction, before anything else touches the store. */
  restore(data: {
    attestations: AttestationRecord[];
    payments: Payment[];
    fraudAlerts: FraudAlert[];
    settlementJobs: SettlementJobRecord[];
    destinationWallets: DestinationWallet[];
    evidenceSubmissions?: EvidenceSubmission[];
  }): void {
    for (const attestation of [...data.attestations].reverse()) {
      this.addAttestation(attestation);
    }
    for (const payment of data.payments) {
      this.payments.set(payment.rewardId, payment);
    }
    for (const alert of data.fraudAlerts) {
      this.fraudAlerts.set(alert.rewardId, alert);
    }
    for (const job of data.settlementJobs) {
      this.settlementJobs.set(job.rewardId, job);
    }
    for (const wallet of data.destinationWallets) {
      this.destinationWallets.set(wallet.supplier, wallet);
    }
    for (const submission of data.evidenceSubmissions ?? []) {
      this.evidenceSubmissions.set(submission.proofHash, submission);
      this.evidenceSubmissionSeq = Math.max(this.evidenceSubmissionSeq, Number(submission.id) || 0);
    }
  }
}
