import type { Payment, RiskAnalysis } from '@provenance-streams/protocol';

import type { AttestationRecord, PolicySummary } from './api.js';

/**
 * `attention` is distinct from `failed` per the design language (1.3): coral
 * means "needs review, not failure" (e.g. an auditor referencing a policy id
 * that doesn't exist — recoverable, not a protocol failure); red (`failed`)
 * is reserved for genuine failures, like an on-chain settlement that reverted.
 */
export type NodeStatus = 'waiting' | 'active' | 'complete' | 'failed' | 'attention' | 'unavailable';

export interface StreamNode {
  key: string;
  label: string;
  status: NodeStatus;
  timestamp?: string | undefined;
  detail?: string | undefined;
  /** Only populated on the ai-risk-analysis node once a real score exists. */
  score?: number | undefined;
  confidence?: number | undefined;
}

export interface Stream {
  id: string;
  attestation: AttestationRecord;
  policy: PolicySummary | undefined;
  payment: Payment | undefined;
  nodes: StreamNode[];
}

export type StreamTone = 'neutral' | 'positive' | 'warning' | 'attention' | 'negative';

/** A one-line summary of where a stream is, for list views. Derived only from real node statuses. */
export function getOverallStatus(stream: Stream): { label: string; tone: StreamTone } {
  const byKey = Object.fromEntries(stream.nodes.map((node) => [node.key, node]));

  if (byKey['policy-matched']?.status === 'attention') {
    return { label: 'Policy Mismatch', tone: 'attention' };
  }
  if (byKey['supplier-paid']?.status === 'complete') {
    return { label: 'Paid', tone: 'positive' };
  }
  if (
    byKey['supplier-paid']?.status === 'failed' ||
    byKey['circle-settlement']?.status === 'failed'
  ) {
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
 * Merges the four independent read models the backend already exposes
 * (attestations, policies, payments, risk analyses) into one "stream" per
 * attestation, with a status per pipeline node.
 *
 * One node from the design mock — Signature Verified — has no backing data
 * anywhere in the system (no separate signature-check step is recorded). It's
 * kept as a visual slot so the pipeline shape matches the design system, but
 * always reports `unavailable` rather than inventing a value. AI Risk
 * Analysis, by contrast, is real once `GEMINI_API_KEY` is configured on the
 * backend — see `riskAnalysisService.ts`; it falls back to the same honest
 * `unavailable` state when no risk-analysis record exists for a stream.
 */
export function buildStreams(
  attestations: AttestationRecord[],
  policies: PolicySummary[],
  payments: Payment[],
  riskAnalyses: RiskAnalysis[] = [],
): Stream[] {
  const policiesById = new Map(policies.map((policy) => [policy.id, policy]));
  const paymentsByAttestationId = new Map(
    payments.map((payment) => [payment.attestationId, payment]),
  );
  const riskAnalysesByAttestationId = new Map(
    riskAnalyses.map((analysis) => [analysis.attestationId, analysis]),
  );

  return attestations.map((attestation) => {
    const policy = policiesById.get(attestation.policyId);
    const payment = paymentsByAttestationId.get(attestation.id);
    const riskAnalysis = riskAnalysesByAttestationId.get(attestation.id);

    return {
      id: attestation.id,
      attestation,
      policy,
      payment,
      nodes: buildNodes(attestation, policy, payment, riskAnalysis),
    };
  });
}

function buildNodes(
  attestation: AttestationRecord,
  policy: PolicySummary | undefined,
  payment: Payment | undefined,
  riskAnalysis: RiskAnalysis | undefined,
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
    payment?.status === 'complete'
      ? 'complete'
      : payment?.status === 'failed'
        ? 'failed'
        : 'waiting';

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
      status: policy ? 'complete' : 'attention',
      timestamp: policy ? attestation.observedAt : undefined,
      detail: policy ? policy.credentialType : 'Policy not found — needs review',
    },
    buildRiskAnalysisNode(riskAnalysis),
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
      detail:
        paidStatus === 'complete'
          ? payment?.bridged
            ? `Bridged to ${payment.destinationChain ?? 'destination chain'} (${payment.destinationTxHash ?? payment.txHash})`
            : (payment?.txHash ?? 'Paid')
          : 'Reward Ready',
    },
  ];
}

function buildRiskAnalysisNode(riskAnalysis: RiskAnalysis | undefined): StreamNode {
  if (!riskAnalysis) {
    return {
      key: 'ai-risk-analysis',
      label: 'AI Risk Analysis',
      status: 'unavailable',
      detail: 'No fraud-scoring service configured yet',
    };
  }

  if (riskAnalysis.status === 'pending') {
    return {
      key: 'ai-risk-analysis',
      label: 'AI Risk Analysis',
      status: 'active',
      detail: 'Analyzing submitted evidence…',
    };
  }

  if (riskAnalysis.status === 'failed') {
    return {
      key: 'ai-risk-analysis',
      label: 'AI Risk Analysis',
      status: 'failed',
      timestamp: riskAnalysis.updatedAt,
      detail: riskAnalysis.error ?? 'Risk analysis failed',
    };
  }

  return {
    key: 'ai-risk-analysis',
    label: 'AI Risk Analysis',
    status: 'complete',
    timestamp: riskAnalysis.updatedAt,
    detail: riskAnalysis.summary,
    score: riskAnalysis.score,
    confidence: riskAnalysis.confidence,
  };
}
