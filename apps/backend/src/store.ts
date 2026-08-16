import { EventEmitter } from 'node:events';

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
  StoreEvent,
  StoreEventKind,
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
import { createRiskAnalysesRepo } from './db/repositories/riskAnalysesRepo.js';
import { createSettlementJobsRepo } from './db/repositories/settlementJobsRepo.js';

export type { AttestationRecord } from './db/repositories/attestationsRepo.js';

/**
 * Read models for the dashboards, populated by the agent's hooks as it
 * observes on-chain events. Attestations/payments/evidence submissions/
 * destination wallets/fraud alerts/settlement jobs/risk analyses persist to
 * Postgres (see `db/repositories/`) so they survive a restart or redeploy.
 * `signatureVerifications` stays in-memory only — genuinely cheap to
 * rederive (it's a pure function of an already-confirmed transaction, no
 * external API call), unlike risk analyses (a real AI call, previously also
 * in-memory only — that meant a restart silently wiped real scores, since
 * nothing re-runs analysis for already-attested items on boot).
 */
export class Store {
  private readonly attestationsRepo;
  private readonly paymentsRepo;
  private readonly evidenceSubmissionsRepo;
  private readonly destinationWalletsRepo;
  private readonly fraudAlertsRepo;
  private readonly settlementJobsRepo;
  private readonly riskAnalysesRepo;
  private readonly signatureVerifications = new Map<string, SignatureVerification>();
  private lastEventAt: string | undefined;
  private treasuryMode = 'local';
  private readonly emitter = new EventEmitter();

  constructor(pool: Pool) {
    this.attestationsRepo = createAttestationsRepo(pool);
    this.paymentsRepo = createPaymentsRepo(pool);
    this.evidenceSubmissionsRepo = createEvidenceSubmissionsRepo(pool);
    this.destinationWalletsRepo = createDestinationWalletsRepo(pool);
    this.fraudAlertsRepo = createFraudAlertsRepo(pool);
    this.settlementJobsRepo = createSettlementJobsRepo(pool);
    this.riskAnalysesRepo = createRiskAnalysesRepo(pool);
  }

  /** Subscribes to every mutation across all entities; returns an unsubscribe function. Powers the SSE routes in `server.ts` — nothing else should call this. */
  onChange(listener: (event: StoreEvent) => void): () => void {
    this.emitter.on('change', listener);
    return () => {
      this.emitter.off('change', listener);
    };
  }

  private emitChange(kind: StoreEventKind): void {
    this.emitter.emit('change', { kind } satisfies StoreEvent);
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
      this.emitChange('attestation');
    }
  }

  listAttestations(): Promise<AttestationRecord[]> {
    return this.attestationsRepo.list();
  }

  async createPendingPayment(input: {
    rewardId: string;
    attestationId: string;
    supplier: Address;
    policyId: string;
    rewardAmount: string;
  }): Promise<void> {
    this.lastEventAt = new Date().toISOString();
    await this.paymentsRepo.createPending(input);
    this.emitChange('payment');
  }

  async updatePaymentStatus(
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
    await this.paymentsRepo.updateStatus(rewardId, status, extra);
    this.emitChange('payment');
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
  async createEvidenceSubmission(input: {
    supplier: Address;
    policyId: string;
    evidenceText: string;
  }): Promise<EvidenceSubmission> {
    const proofHash = keccak256(toHex(input.evidenceText));
    const record = await this.evidenceSubmissionsRepo.create({ ...input, proofHash });
    this.emitChange('evidence-submission');
    return record;
  }

  /** Non-destructive — a submission stays queryable after an auditor attests to it. */
  getEvidenceSubmission(proofHash: Hex): Promise<EvidenceSubmission | undefined> {
    return this.evidenceSubmissionsRepo.getByProofHash(proofHash);
  }

  listEvidenceSubmissions(status?: EvidenceSubmission['status']): Promise<EvidenceSubmission[]> {
    return this.evidenceSubmissionsRepo.list(status);
  }

  async markEvidenceAttested(proofHash: Hex, attestationId: string): Promise<void> {
    await this.evidenceSubmissionsRepo.markAttested(proofHash, attestationId);
    this.emitChange('evidence-submission');
  }

  async markEvidenceRejected(proofHash: Hex): Promise<void> {
    await this.evidenceSubmissionsRepo.markRejected(proofHash);
    this.emitChange('evidence-submission');
  }

  async createPendingRiskAnalysis(attestationId: string): Promise<void> {
    await this.riskAnalysesRepo.createPending(attestationId);
    this.emitChange('risk-analysis');
  }

  async updateRiskAnalysisStatus(
    attestationId: string,
    status: RiskAnalysisStatus,
    extra?: {
      score?: number;
      confidence?: number;
      summary?: string;
      provider?: string;
      error?: string;
    },
  ): Promise<void> {
    await this.riskAnalysesRepo.updateStatus(attestationId, status, extra);
    this.emitChange('risk-analysis');
  }

  listRiskAnalyses(): Promise<RiskAnalysis[]> {
    return this.riskAnalysesRepo.list();
  }

  getRiskAnalysis(attestationId: string): Promise<RiskAnalysis | undefined> {
    return this.riskAnalysesRepo.get(attestationId);
  }

  createPendingSignatureVerification(attestationId: string): void {
    const now = new Date().toISOString();
    this.signatureVerifications.set(attestationId, {
      attestationId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    this.emitChange('signature-verification');
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
    this.emitChange('signature-verification');
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

  async registerDestinationWallet(input: {
    supplier: Address;
    /** Not always `0x`-prefixed — Solana destinations use base58. */
    chain: string;
    address: string;
    x402ClaimUrl?: string | undefined;
  }): Promise<DestinationWallet> {
    const record = await this.destinationWalletsRepo.register(input);
    this.emitChange('destination-wallet');
    return record;
  }

  getDestinationWallet(supplier: Address): Promise<DestinationWallet | undefined> {
    return this.destinationWalletsRepo.get(supplier);
  }

  async createFraudAlert(input: {
    rewardId: string;
    attestationId: string;
    supplier: Address;
    policyId: string;
    rewardAmount: string;
    score: number;
    reasons: string[];
  }): Promise<void> {
    await this.fraudAlertsRepo.create(input);
    this.emitChange('fraud-alert');
  }

  getFraudAlert(rewardId: string): Promise<FraudAlert | undefined> {
    return this.fraudAlertsRepo.get(rewardId);
  }

  async updateFraudAlertStatus(
    rewardId: string,
    status: FraudAlertStatus,
    resolvedBy?: string,
  ): Promise<void> {
    await this.fraudAlertsRepo.updateStatus(rewardId, status, resolvedBy);
    this.emitChange('fraud-alert');
  }

  /** Tracks whether this alert's resolution has been anchored on `DecisionRegistry` (see `DecisionAnchorService`). */
  async updateFraudAlertAnchor(
    rewardId: string,
    status: DecisionAnchor['status'],
    txHash?: Hex,
  ): Promise<void> {
    await this.fraudAlertsRepo.updateAnchor(rewardId, status, txHash);
    this.emitChange('fraud-alert');
  }

  listFraudAlerts(): Promise<FraudAlert[]> {
    return this.fraudAlertsRepo.list();
  }

  async updateSettlementJobState(
    rewardId: string,
    state: SettlementJobState,
    extra?: { attempt?: number | undefined; error?: string | undefined },
  ): Promise<void> {
    await this.settlementJobsRepo.updateState(rewardId, state, extra);
    this.emitChange('settlement-job');
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
