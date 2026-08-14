import type { Payment, RiskAnalysis, SignatureVerification } from '@provenance-streams/protocol';
import { describe, expect, it } from 'vitest';

import type { AttestationRecord, PolicySummary } from './api.js';
import { buildStreams, getOrbState, getOverallStatus } from './streams.js';

const SUPPLIER = '0xef16CE280c76295DbE269175fB823B168904EB37';
const AUDITOR = '0x0a782425A66dA23f49eEDBC79d633430CF7307D2';

const attestation: AttestationRecord = {
  id: '1',
  supplier: SUPPLIER,
  auditor: AUDITOR,
  policyId: '1',
  observedAt: '2026-08-01T00:00:00.000Z',
};

const policy: PolicySummary = {
  id: '1',
  credentialType: 'ORGANIC-COFFEE-GRADE-A',
  rewardAmount: '1000000000000000000',
  enabled: true,
  createdAt: '2026-07-01T00:00:00.000Z',
};

describe('buildStreams', () => {
  it('merges a matched policy and a settled payment into complete nodes', () => {
    const payment: Payment = {
      rewardId: '1',
      attestationId: '1',
      supplier: SUPPLIER,
      policyId: '1',
      rewardAmount: '1000000000000000000',
      status: 'complete',
      txHash: '0xabc',
      createdAt: '2026-08-01T00:05:00.000Z',
      updatedAt: '2026-08-01T00:10:00.000Z',
    };

    const [stream] = buildStreams([attestation], [policy], [payment]);
    const byKey = Object.fromEntries(stream!.nodes.map((node) => [node.key, node]));

    expect(byKey['policy-matched']?.status).toBe('complete');
    expect(byKey['policy-matched']?.detail).toBe('ORGANIC-COFFEE-GRADE-A');
    expect(byKey['circle-settlement']?.status).toBe('complete');
    expect(byKey['supplier-paid']?.status).toBe('complete');
    expect(byKey['supplier-paid']?.detail).toBe('0xabc');
  });

  it('flags a missing policy as attention, not failed', () => {
    const [stream] = buildStreams([attestation], [], []);
    const byKey = Object.fromEntries(stream!.nodes.map((node) => [node.key, node]));

    expect(byKey['policy-matched']?.status).toBe('attention');
    expect(byKey['policy-matched']?.detail).toBe('Policy not found — needs review');
  });

  it('marks settlement as failed and carries the real error through, not a generic message', () => {
    const payment: Payment = {
      rewardId: '1',
      attestationId: '1',
      supplier: SUPPLIER,
      policyId: '1',
      rewardAmount: '1000000000000000000',
      status: 'failed',
      error: 'Insufficient treasury balance',
      createdAt: '2026-08-01T00:05:00.000Z',
      updatedAt: '2026-08-01T00:10:00.000Z',
    };

    const [stream] = buildStreams([attestation], [policy], [payment]);
    const byKey = Object.fromEntries(stream!.nodes.map((node) => [node.key, node]));

    expect(byKey['circle-settlement']?.status).toBe('failed');
    expect(byKey['circle-settlement']?.detail).toBe('Insufficient treasury balance');
    expect(byKey['supplier-paid']?.status).toBe('failed');
  });

  it('reports a signer mismatch as attention (recoverable), not failed', () => {
    const signatureVerification: SignatureVerification = {
      attestationId: '1',
      status: 'complete',
      verified: false,
      signerAddress: '0x0000000000000000000000000000000000dEaD',
      createdAt: '2026-08-01T00:00:30.000Z',
      updatedAt: '2026-08-01T00:01:00.000Z',
    };

    const [stream] = buildStreams([attestation], [policy], [], [], [signatureVerification]);
    const byKey = Object.fromEntries(stream!.nodes.map((node) => [node.key, node]));

    expect(byKey['signature-verified']?.status).toBe('attention');
  });

  it('leaves risk analysis unavailable when none is configured, not stuck pending', () => {
    const [stream] = buildStreams([attestation], [policy], []);
    const byKey = Object.fromEntries(stream!.nodes.map((node) => [node.key, node]));

    expect(byKey['ai-risk-analysis']?.status).toBe('unavailable');
  });

  it('surfaces a complete risk analysis score and confidence on its node', () => {
    const riskAnalysis: RiskAnalysis = {
      attestationId: '1',
      status: 'complete',
      score: 82,
      confidence: 91,
      summary: 'Evidence is internally consistent with the claimed grade.',
      provider: 'Gemini',
      createdAt: '2026-08-01T00:01:30.000Z',
      updatedAt: '2026-08-01T00:02:00.000Z',
    };

    const [stream] = buildStreams([attestation], [policy], [], [riskAnalysis]);
    const byKey = Object.fromEntries(stream!.nodes.map((node) => [node.key, node]));

    expect(byKey['ai-risk-analysis']?.status).toBe('complete');
    expect(byKey['ai-risk-analysis']?.score).toBe(82);
    expect(byKey['ai-risk-analysis']?.confidence).toBe(91);
  });
});

describe('getOverallStatus', () => {
  it('reports Policy Mismatch above every other status, even once paid', () => {
    const [stream] = buildStreams([attestation], [], []);
    expect(getOverallStatus(stream!)).toEqual({ label: 'Policy Mismatch', tone: 'attention' });
  });

  it('reports Paid once the supplier is actually paid', () => {
    const payment: Payment = {
      rewardId: '1',
      attestationId: '1',
      supplier: SUPPLIER,
      policyId: '1',
      rewardAmount: '1000000000000000000',
      status: 'complete',
      txHash: '0xabc',
      createdAt: '2026-08-01T00:05:00.000Z',
      updatedAt: '2026-08-01T00:10:00.000Z',
    };
    const [stream] = buildStreams([attestation], [policy], [payment]);
    expect(getOverallStatus(stream!)).toEqual({ label: 'Paid', tone: 'positive' });
  });

  it('reports Live for a freshly submitted attestation with no payment yet', () => {
    const [stream] = buildStreams([attestation], [policy], []);
    expect(getOverallStatus(stream!)).toEqual({ label: 'Live', tone: 'neutral' });
  });
});

describe('getOrbState', () => {
  it('excludes unavailable nodes from the verification percentage', () => {
    // No risk analysis or signature verification configured — both nodes
    // are 'unavailable' and must not drag the percentage down as if they
    // were incomplete real steps.
    const [stream] = buildStreams([attestation], [policy], []);
    const orb = getOrbState(stream!);

    // Real nodes here: attestation-submitted (complete), policy-matched
    // (complete), treasury-approved/circle-settlement/supplier-paid
    // (waiting) — 2 of 5 complete, unavailable nodes excluded entirely.
    expect(orb.verification).toBeCloseTo(40, 5);
    expect(orb.rewardSettled).toBe(false);
  });

  it('reports full verification and a settled reward once fully paid', () => {
    const payment: Payment = {
      rewardId: '1',
      attestationId: '1',
      supplier: SUPPLIER,
      policyId: '1',
      rewardAmount: '1000000000000000000',
      status: 'complete',
      txHash: '0xabc',
      createdAt: '2026-08-01T00:05:00.000Z',
      updatedAt: '2026-08-01T00:10:00.000Z',
    };
    const [stream] = buildStreams([attestation], [policy], [payment]);
    const orb = getOrbState(stream!);

    expect(orb.verification).toBe(100);
    expect(orb.rewardSettled).toBe(true);
  });
});
