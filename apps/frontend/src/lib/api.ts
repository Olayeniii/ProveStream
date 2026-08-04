import type {
  AgentHealth,
  DestinationWallet,
  FraudAlert,
  Payment,
  RiskAnalysis,
  SettlementJobRecord,
} from '@provenance-streams/protocol';

export interface TreasuryBalance {
  amount: string;
  symbol: string;
}

export interface PolicySummary {
  id: string;
  credentialType: string;
  rewardAmount: string;
  enabled: boolean;
  createdAt: string;
}

export interface AttestationRecord {
  id: string;
  supplier: string;
  auditor: string;
  policyId: string;
  observedAt: string;
}

export interface WalletSession {
  userId: string;
  userToken: string;
  encryptionKey: string;
  appId: string;
}

export interface EmbeddedWallet {
  id: string;
  address: string;
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(
      body?.error ?? `Request to ${path} failed with status ${response.status.toString()}`,
    );
  }

  return response.json() as Promise<T>;
}

/** Like `request`, but resolves to `undefined` on a 404 instead of throwing (e.g. "no destination wallet registered yet"). */
async function requestOptional<T>(baseUrl: string, path: string): Promise<T | undefined> {
  const response = await fetch(`${baseUrl}${path}`);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(
      body?.error ?? `Request to ${path} failed with status ${response.status.toString()}`,
    );
  }
  return response.json() as Promise<T>;
}

/** Typed client for the backend's dashboard and embedded-wallet APIs. */
export function createApiClient(baseUrl: string) {
  return {
    getHealth: () => request<{ status: string }>(baseUrl, '/api/health'),
    getTreasuryBalance: () => request<TreasuryBalance>(baseUrl, '/api/treasury'),
    listPolicies: () => request<PolicySummary[]>(baseUrl, '/api/policies'),
    listAttestations: () => request<AttestationRecord[]>(baseUrl, '/api/attestations'),
    listPayments: () => request<Payment[]>(baseUrl, '/api/payments'),
    listRiskAnalyses: () => request<RiskAnalysis[]>(baseUrl, '/api/risk-analyses'),

    registerDestinationWallet: (input: { supplier: string; chain: string; address: string }) =>
      request<DestinationWallet>(baseUrl, '/api/destination-wallet', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    getDestinationWallet: (supplier: string) =>
      requestOptional<DestinationWallet>(baseUrl, `/api/destination-wallet/${supplier}`),

    listFraudAlerts: () => request<FraudAlert[]>(baseUrl, '/api/fraud-alerts'),
    approveFraudAlert: (rewardId: string) =>
      request<{ ok: true }>(baseUrl, `/api/fraud-alerts/${rewardId}/approve`, { method: 'POST' }),
    rejectFraudAlert: (rewardId: string) =>
      request<{ ok: true }>(baseUrl, `/api/fraud-alerts/${rewardId}/reject`, { method: 'POST' }),

    listSettlementQueue: () => request<SettlementJobRecord[]>(baseUrl, '/api/settlement-queue'),
    getAgentHealth: () => request<AgentHealth>(baseUrl, '/api/agent-health'),

    submitEvidence: (input: { proofHash: string; evidenceText: string }) =>
      request<{ ok: true }>(baseUrl, '/api/evidence', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    createWalletSession: (userId: string) =>
      request<WalletSession>(baseUrl, '/api/wallet-sessions', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),

    createWalletChallenge: (userId: string, userToken: string) =>
      request<{ challengeId: string }>(baseUrl, `/api/wallet-sessions/${userId}/wallet-challenge`, {
        method: 'POST',
        body: JSON.stringify({ userToken }),
      }),

    listWallets: (userId: string, userToken: string) =>
      request<EmbeddedWallet[]>(
        baseUrl,
        `/api/wallet-sessions/${userId}/wallets?userToken=${encodeURIComponent(userToken)}`,
      ),

    createAttestationChallenge: (
      userId: string,
      input: {
        userToken: string;
        walletId: string;
        supplier: string;
        proofHash: string;
        policyId: string;
      },
    ) =>
      request<{ challengeId: string }>(
        baseUrl,
        `/api/wallet-sessions/${userId}/attestation-challenge`,
        { method: 'POST', body: JSON.stringify(input) },
      ),

    waitForChallengeTxHash: (userId: string, challengeId: string, userToken: string) =>
      request<{ txHash: string }>(
        baseUrl,
        `/api/wallet-sessions/${userId}/challenges/${challengeId}/tx-hash`,
        { method: 'POST', body: JSON.stringify({ userToken }) },
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
