import type { Payment } from '@provenance-streams/protocol';

import type { AttestationRecord, PolicySummary } from './api.js';

export type NodeStatus = 'waiting' | 'active' | 'complete' | 'failed' | 'unavailable';

export interface StreamNode {
  key: string;
  label: string;
  status: NodeStatus;
  timestamp?: string | undefined;
  detail?: string | undefined;
}

export interface Stream {
  id: string;
  attestation: AttestationRecord;
  policy: PolicySummary | undefined;
  payment: Payment | undefined;
  nodes: StreamNode[];
}

export type StreamTone = 'neutral' | 'positive' | 'warning' | 'negative';

/** A one-line summary of where a stream is, for list views. Derived only from real node statuses. */
export function getOverallStatus(stream: Stream): { label: string; tone: StreamTone } {
  const byKey = Object.fromEntries(stream.nodes.map((node) => [node.key, node]));

  if (byKey['policy-matched']?.status === 'failed') {
    return { label: 'Policy Mismatch', tone: 'negative' };
  }
  if (byKey['supplier-paid']?.status === 'complete') {
    return { label: 'Paid', tone: 'positive' };
  }
  if (byKey['supplier-paid']?.status === 'failed' || byKey['circle-settlement']?.status === 'failed') {
    return { label: 'Failed', tone: 'negative' };
  }
  if (byKey['circle-settlement']?.status === 'active') {
    return { label: 'Settling', tone: 'warning' };
  }
  if (byKey['treasury-approved']?.status === 'complete') {
    return { label: 'Reward Ready', tone: 'warning' };
  }
  return { label: 'Live', tone: 'neutral' };
}

/**
 * Merges the three independent read models the backend already exposes
 * (attestations, policies, payments) into one "stream" per attestation, with
 * a status per pipeline node.
 *
 * Two nodes from the design mock — Signature Verified and AI Risk Analysis —
 * have no backing data anywhere in the system (no separate signature-check
 * step is recorded, and there's no fraud-scoring service). They're kept as
 * visual slots so the pipeline shape matches the design system, but always
 * report `unavailable` rather than inventing a score.
 */
export function buildStreams(
  attestations: AttestationRecord[],
  policies: PolicySummary[],
  payments: Payment[],
): Stream[] {
  const policiesById = new Map(policies.map((policy) => [policy.id, policy]));
  const paymentsByAttestationId = new Map(payments.map((payment) => [payment.attestationId, payment]));

  return attestations.map((attestation) => {
    const policy = policiesById.get(attestation.policyId);
    const payment = paymentsByAttestationId.get(attestation.id);

    return {
      id: attestation.id,
      attestation,
      policy,
      payment,
      nodes: buildNodes(attestation, policy, payment),
    };
  });
}

function buildNodes(
  attestation: AttestationRecord,
  policy: PolicySummary | undefined,
  payment: Payment | undefined,
): StreamNode[] {
  const settlementStatus: NodeStatus =
    payment?.status === 'complete'
      ? 'complete'
      : payment?.status === 'failed'
        ? 'failed'
        : payment
          ? 'active'
          : 'waiting';

  const paidStatus: NodeStatus =
    payment?.status === 'complete' ? 'complete' : payment?.status === 'failed' ? 'failed' : 'waiting';

  return [
    {
      key: 'attestation-submitted',
      label: 'Attestation Submitted',
      status: 'complete',
      timestamp: attestation.observedAt,
      detail: `Auditor ${attestation.auditor}`,
    },
    {
      key: 'signature-verified',
      label: 'Signature Verified',
      status: 'unavailable',
      detail: 'Not tracked as a separate step yet',
    },
    {
      key: 'policy-matched',
      label: 'Policy Matched',
      status: policy ? 'complete' : 'failed',
      timestamp: policy ? attestation.observedAt : undefined,
      detail: policy ? policy.credentialType : 'Policy not found',
    },
    {
      key: 'ai-risk-analysis',
      label: 'AI Risk Analysis',
      status: 'unavailable',
      detail: 'No fraud-scoring service configured yet',
    },
    {
      key: 'treasury-approved',
      label: 'Treasury Approved',
      status: payment ? 'complete' : 'waiting',
      timestamp: payment?.createdAt,
      detail: payment ? `Reward #${payment.rewardId}` : 'Awaiting eligibility check',
    },
    {
      key: 'circle-settlement',
      label: 'Circle Settlement',
      status: settlementStatus,
      timestamp: payment?.updatedAt,
      detail:
        settlementStatus === 'complete'
          ? 'Settled'
          : settlementStatus === 'failed'
            ? (payment?.error ?? 'Settlement failed')
            : settlementStatus === 'active'
              ? 'Settling'
              : 'Waiting on treasury approval',
    },
    {
      key: 'supplier-paid',
      label: 'Supplier Paid',
      status: paidStatus,
      timestamp: paidStatus === 'complete' ? payment?.updatedAt : undefined,
      detail: payment?.txHash ?? (paidStatus === 'complete' ? 'Paid' : 'Reward Ready'),
    },
  ];
}
