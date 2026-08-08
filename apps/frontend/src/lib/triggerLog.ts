import type {
  FraudAlert,
  Payment,
  RiskAnalysis,
  SettlementJobRecord,
  SignatureVerification,
} from '@provenance-streams/protocol';

import type { AttestationRecord } from './api.js';
import type { StreamTone } from './streams.js';

export interface TriggerLogEntry {
  id: string;
  timestamp: string;
  message: string;
  tone: StreamTone;
}

/**
 * A single, chronological, cross-attestation activity feed — the per-stream
 * timelines (`StreamTimeline`) already show "what happened to this
 * attestation"; this answers "what has the agent been doing, across
 * everything." Derives one entry per real, terminal event from data this app
 * already fetches elsewhere — no new backend routes, no invented events, no
 * synthetic "policy matched" step (that check has no independent timestamp
 * in the data, so it's skipped rather than faked).
 */
export function buildTriggerLog(
  attestations: AttestationRecord[],
  payments: Payment[],
  riskAnalyses: RiskAnalysis[],
  signatureVerifications: SignatureVerification[],
  fraudAlerts: FraudAlert[],
  settlementJobs: SettlementJobRecord[],
): TriggerLogEntry[] {
  const entries: TriggerLogEntry[] = [];

  for (const attestation of attestations) {
    entries.push({
      id: `attestation-${attestation.id}`,
      timestamp: attestation.observedAt,
      message: `Attestation #${attestation.id} submitted by ${attestation.auditor} for ${attestation.supplier}`,
      tone: 'neutral',
    });
  }

  for (const verification of signatureVerifications) {
    if (verification.status === 'complete') {
      entries.push({
        id: `signature-${verification.attestationId}`,
        timestamp: verification.updatedAt,
        message: verification.verified
          ? `Signature verified for attestation #${verification.attestationId} — signer matches auditor`
          : `Signature mismatch on attestation #${verification.attestationId} — signer does not match the recorded auditor`,
        tone: verification.verified ? 'positive' : 'attention',
      });
    } else if (verification.status === 'failed') {
      entries.push({
        id: `signature-${verification.attestationId}`,
        timestamp: verification.updatedAt,
        message: `Signature verification failed for attestation #${verification.attestationId}: ${verification.error ?? 'unknown error'}`,
        tone: 'negative',
      });
    }
  }

  for (const analysis of riskAnalyses) {
    if (analysis.status === 'complete' && analysis.score !== undefined) {
      const score = analysis.score;
      entries.push({
        id: `risk-${analysis.attestationId}`,
        timestamp: analysis.updatedAt,
        message: `AI risk analysis on attestation #${analysis.attestationId}: ${score}/100 (${analysis.provider})`,
        tone: score >= 70 ? 'attention' : score >= 30 ? 'warning' : 'positive',
      });
    } else if (analysis.status === 'failed') {
      entries.push({
        id: `risk-${analysis.attestationId}`,
        timestamp: analysis.updatedAt,
        message: `AI risk analysis failed for attestation #${analysis.attestationId}: ${analysis.error ?? 'unavailable'}`,
        tone: 'negative',
      });
    }
  }

  for (const payment of payments) {
    entries.push({
      id: `payment-eligible-${payment.rewardId}`,
      timestamp: payment.createdAt,
      message: `Reward #${payment.rewardId} became eligible — ${payment.rewardAmount} to ${payment.supplier}`,
      tone: 'neutral',
    });
    if (payment.status === 'complete') {
      entries.push({
        id: `payment-settled-${payment.rewardId}`,
        timestamp: payment.updatedAt,
        message: payment.bridged
          ? `Reward #${payment.rewardId} settled — bridged to ${payment.destinationChain ?? 'destination chain'} (${payment.destinationTxHash ?? payment.txHash})`
          : `Reward #${payment.rewardId} settled — ${payment.txHash}`,
        tone: 'positive',
      });
    } else if (payment.status === 'failed') {
      entries.push({
        id: `payment-failed-${payment.rewardId}`,
        timestamp: payment.updatedAt,
        message: `Reward #${payment.rewardId} settlement failed: ${payment.error ?? 'unknown error'}`,
        tone: 'negative',
      });
    }
  }

  for (const alert of fraudAlerts) {
    entries.push({
      id: `fraud-flagged-${alert.rewardId}`,
      timestamp: alert.createdAt,
      message: `Reward #${alert.rewardId} held for review (score ${alert.score}/100)${alert.reasons[0] ? ` — ${alert.reasons[0]}` : ''}`,
      tone: 'attention',
    });
    if (alert.status === 'approved') {
      entries.push({
        id: `fraud-approved-${alert.rewardId}`,
        timestamp: alert.updatedAt,
        message: `Reward #${alert.rewardId} approved for payout by an admin`,
        tone: 'positive',
      });
    } else if (alert.status === 'rejected') {
      entries.push({
        id: `fraud-rejected-${alert.rewardId}`,
        timestamp: alert.updatedAt,
        message: `Reward #${alert.rewardId} rejected by an admin`,
        tone: 'negative',
      });
    }
  }

  for (const job of settlementJobs) {
    if (job.state === 'retrying') {
      entries.push({
        id: `job-retry-${job.rewardId}-${job.updatedAt}`,
        timestamp: job.updatedAt,
        message: `Settlement for reward #${job.rewardId} retrying (attempt ${job.attempt ?? '?'})${job.error ? `: ${job.error}` : ''}`,
        tone: 'warning',
      });
    }
  }

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50);
}
