import type {
  AgentHealth,
  DecisionAnchor,
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
import type { Pool } from 'pg';
import type { Address, Hex } from 'viem';
import { keccak256, toHex } from 'viem';

import type { AttestationRecord } from './db/repositories/attestationsRepo.js';
import { createAttestationsRepo } from './db/repositories/attestationsRepo.js';
import { createDestinationWalletsRepo } from './db/repositories/destinationWalletsRepo.js';
import { createEvidenceSubmissionsRepo } from './db/repositories/evidenceSubmissionsRepo.js';
import { createFraudAlertsRepo } from './db/repositories/fraudAlertsRepo.js';
import { createPaymentsRepo } from './db/repositories/paymentsRepo.js';
import { createSettlementJobsRepo } from './db/repositories/settlementJobsRepo.js';

export type { AttestationRecord } from './db/repositories/attestationsRepo.js';

/**
 * Read models for the dashboards, populated by the agent's hooks as it
 * observes on-chain events. Attestations/payments/evidence submissions/
 * destination wallets/fraud alerts/settlement jobs persist to Postgres (see
 * `db/repositories/`) so they survive a restart or redeploy. `riskAnalyses`
 * and `signatureVerifications` stay in-memory only — deliberately excluded
 * from persistence, since both are cheap to rederive from chain state on
 * boot and neither needs to survive a restart.
 */
export class Store {
  private readonly attestationsRepo;
  private readonly paymentsRepo;
  private readonly evidenceSubmissionsRepo;
  private readonly destinationWalletsRepo;
  private readonly fraudAlertsRepo;
  private readonly settlementJobsRepo;
  private readonly riskAnalyses = new Map<string, RiskAnalysis>();
  private readonly signatureVerifications = new Map<string, SignatureVerification>();
  private lastEventAt: string | undefined;
  private treasuryMode = 'local';

  constructor(pool: Pool) {
    this.attestationsRepo = createAttestationsRepo(pool);
    this.paymentsRepo = createPaymentsRepo(pool);
    this.evidenceSubmissionsRepo = createEvidenceSubmissionsRepo(pool);
    this.destinationWalletsRepo = createDestinationWalletsRepo(pool);
    this.fraudAlertsRepo = createFraudAlertsRepo(pool);
    this.settlementJobsRepo = createSettlementJobsRepo(pool);
  }

  /**
   * Idempotent by `id`: both the live watcher and `HistoryService`'s startup
   * backfill can observe the same attestation in the small window where
   * their block ranges overlap, and this makes calling it twice a no-op
   * rather than a duplicate dashboard row.
   */
  async addAttestation(record: AttestationRecord): Promise<void> {
    const wasNew = await this.attestationsRepo.insertIfNew(record);
    if (wasNew) {
      this.lastEventAt = new Date().toISOString();
    }
  }

  listAttestations(): Promise<AttestationRecord[]> {
    return this.attestationsRepo.list();
  }

  createPendingPayment(input: {
    rewardId: string;
    attestationId: string;
    supplier: Address;
    policyId: string;
    rewardAmount: string;
  }): Promise<void> {
    this.lastEventAt = new Date().toISOString();
    return this.paymentsRepo.createPending(input);
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
  ): Promise<void> {
    return this.paymentsRepo.updateStatus(rewardId, status, extra);
  }

  listPayments(): Promise<Payment[]> {
    return this.paymentsRepo.list();
  }

  /**
   * Records a supplier's submitted evidence, hashing it the same way
   * `AttestationRegistry` expects (`keccak256(toHex(evidenceText))`) so an
   * auditor's later "Attest" action can reuse this exact `proofHash` instead
   * of re-hashing. Duplicate proof hashes are already rejected on-chain, so
   * this can't collide across two genuinely different submissions — a retry
   * of the same text just overwrites its own still-pending record (enforced
   * by the table's `UNIQUE (proof_hash)` constraint plus the caller retrying
   * `getByProofHash` first, same as before).
   */
  createEvidenceSubmission(input: {
    supplier: Address;
    policyId: string;
    evidenceText: string;
  }): Promise<EvidenceSubmission> {
    const proofHash = keccak256(toHex(input.evidenceText));
    return this.evidenceSubmissionsRepo.create({ ...input, proofHash });
  }

  /** Non-destructive — a submission stays queryable after an auditor attests to it. */
  getEvidenceSubmission(proofHash: Hex): Promise<EvidenceSubmission | undefined> {
    return this.evidenceSubmissionsRepo.getByProofHash(proofHash);
  }

  listEvidenceSubmissions(status?: EvidenceSubmission['status']): Promise<EvidenceSubmission[]> {
    return this.evidenceSubmissionsRepo.list(status);
  }

  markEvidenceAttested(proofHash: Hex, attestationId: string): Promise<void> {
    return this.evidenceSubmissionsRepo.markAttested(proofHash, attestationId);
  }

  markEvidenceRejected(proofHash: Hex): Promise<void> {
    return this.evidenceSubmissionsRepo.markRejected(proofHash);
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

  getRiskAnalysis(attestationId: string): RiskAnalysis | undefined {
    return this.riskAnalyses.get(attestationId);
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
    /** Not always `0x`-prefixed — Solana destinations use base58. */
    chain: string;
    address: string;
    x402ClaimUrl?: string | undefined;
  }): Promise<DestinationWallet> {
    return this.destinationWalletsRepo.register(input);
  }

  getDestinationWallet(supplier: Address): Promise<DestinationWallet | undefined> {
    return this.destinationWalletsRepo.get(supplier);
  }

  createFraudAlert(input: {
    rewardId: string;
    attestationId: string;
    supplier: Address;
    policyId: string;
    rewardAmount: string;
    score: number;
    reasons: string[];
  }): Promise<void> {
    return this.fraudAlertsRepo.create(input);
  }

  getFraudAlert(rewardId: string): Promise<FraudAlert | undefined> {
    return this.fraudAlertsRepo.get(rewardId);
  }

  updateFraudAlertStatus(rewardId: string, status: FraudAlertStatus): Promise<void> {
    return this.fraudAlertsRepo.updateStatus(rewardId, status);
  }

  /** Tracks whether this alert's resolution has been anchored on `DecisionRegistry` (see `DecisionAnchorService`). */
  updateFraudAlertAnchor(
    rewardId: string,
    status: DecisionAnchor['status'],
    txHash?: Hex,
  ): Promise<void> {
    return this.fraudAlertsRepo.updateAnchor(rewardId, status, txHash);
  }

  listFraudAlerts(): Promise<FraudAlert[]> {
    return this.fraudAlertsRepo.list();
  }

  updateSettlementJobState(
    rewardId: string,
    state: SettlementJobState,
    extra?: { attempt?: number | undefined; error?: string | undefined },
  ): Promise<void> {
    return this.settlementJobsRepo.updateState(rewardId, state, extra);
  }

  listSettlementJobs(): Promise<SettlementJobRecord[]> {
    return this.settlementJobsRepo.list();
  }

  async getAgentHealth(): Promise<AgentHealth> {
    const [queueDepth, pendingFraudAlerts] = await Promise.all([
      this.settlementJobsRepo.queueDepth(),
      this.fraudAlertsRepo.pendingCount(),
    ]);
    return {
      queueDepth,
      treasuryMode: this.treasuryMode,
      lastEventAt: this.lastEventAt,
      pendingFraudAlerts,
    };
  }
}
