import type { Payment, PaymentStatus, RiskAnalysis, RiskAnalysisStatus } from '@provenance-streams/protocol';
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
  private readonly payments = new Map<string, Payment>();
  private readonly pendingEvidence = new Map<Hex, string>();
  private readonly riskAnalyses = new Map<string, RiskAnalysis>();

  addAttestation(record: AttestationRecord): void {
    this.attestations.unshift(record);
    this.attestations.length = Math.min(this.attestations.length, MAX_RECORDS);
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
  }

  updatePaymentStatus(
    rewardId: string,
    status: PaymentStatus,
    extra?: { txHash?: Hex; error?: string },
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
}
