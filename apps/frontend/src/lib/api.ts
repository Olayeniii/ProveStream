import type {
  AgentHealth,
  DestinationWallet,
  EvidenceSubmission,
  FraudAlert,
  Payment,
  RiskAnalysis,
  SettlementJobRecord,
  SignatureVerification,
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
  /** A real ProveStream-issued session token (not Circle's `userToken`) — send as `Authorization: Bearer` on role-gated routes. */
  sessionToken: string;
}

export interface AuthenticatedSession {
  userId: string;
  email: string;
  role: 'admin' | 'auditor' | 'supplier';
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

/** Attaches a real session token (issued by `/api/admin/login` or `/api/wallet-sessions`) as a bearer credential for role-gated routes. */
function bearerHeaders(sessionToken: string): RequestInit {
  return { headers: { Authorization: `Bearer ${sessionToken}` } };
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
    registerKnownPolicy: (id: string, adminSessionToken: string) =>
      request<PolicySummary>(baseUrl, `/api/policies/${id}/register`, {
        method: 'POST',
        ...bearerHeaders(adminSessionToken),
      }),
    listAttestations: () => request<AttestationRecord[]>(baseUrl, '/api/attestations'),
    listPayments: () => request<Payment[]>(baseUrl, '/api/payments'),
    listRiskAnalyses: () => request<RiskAnalysis[]>(baseUrl, '/api/risk-analyses'),
    listSignatureVerifications: () =>
      request<SignatureVerification[]>(baseUrl, '/api/signature-verifications'),

    registerDestinationWallet: (
      input: {
        supplier: string;
        chain: string;
        address: string;
        x402ClaimUrl?: string;
      },
      supplierSessionToken: string,
    ) =>
      request<DestinationWallet>(baseUrl, '/api/destination-wallet', {
        method: 'POST',
        body: JSON.stringify(input),
        ...bearerHeaders(supplierSessionToken),
      }),
    getDestinationWallet: (supplier: string) =>
      requestOptional<DestinationWallet>(baseUrl, `/api/destination-wallet/${supplier}`),

    adminLogin: (token: string) =>
      request<{ ok: boolean; sessionToken?: string }>(baseUrl, '/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),

    listFraudAlerts: (adminToken: string) =>
      request<FraudAlert[]>(baseUrl, '/api/fraud-alerts', bearerHeaders(adminToken)),
    approveFraudAlert: (rewardId: string, adminToken: string) =>
      request<{ ok: true }>(baseUrl, `/api/fraud-alerts/${rewardId}/approve`, {
        method: 'POST',
        ...bearerHeaders(adminToken),
      }),
    rejectFraudAlert: (rewardId: string, adminToken: string) =>
      request<{ ok: true }>(baseUrl, `/api/fraud-alerts/${rewardId}/reject`, {
        method: 'POST',
        ...bearerHeaders(adminToken),
      }),

    listSettlementQueue: (adminToken: string) =>
      request<SettlementJobRecord[]>(baseUrl, '/api/settlement-queue', bearerHeaders(adminToken)),
    getAgentHealth: (adminToken: string) =>
      request<AgentHealth>(baseUrl, '/api/agent-health', bearerHeaders(adminToken)),

    createEvidenceSubmission: (input: {
      supplier: string;
      policyId: string;
      evidenceText: string;
    }) =>
      request<EvidenceSubmission>(baseUrl, '/api/evidence-submissions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    listEvidenceSubmissions: (status?: EvidenceSubmission['status']) =>
      request<EvidenceSubmission[]>(
        baseUrl,
        status ? `/api/evidence-submissions?status=${status}` : '/api/evidence-submissions',
      ),
    rejectEvidenceSubmission: (proofHash: string, auditorSessionToken: string) =>
      request<{ ok: true }>(baseUrl, `/api/evidence-submissions/${proofHash}/reject`, {
        method: 'POST',
        ...bearerHeaders(auditorSessionToken),
      }),

    /**
     * `existingSessionToken`, when it's still valid for this exact `userId`/`role`,
     * lets the backend reuse it instead of minting a redundant session — the
     * resume-on-reload path (see `useEmbeddedWallet.ts`) still needs to call this
     * to refresh the Circle-side `userToken`/wallet list, but shouldn't churn a
     * fresh ProveStream session every time it does.
     */
    createWalletSession: (
      userId: string,
      role: 'auditor' | 'supplier',
      existingSessionToken?: string,
    ) =>
      request<WalletSession>(baseUrl, '/api/wallet-sessions', {
        method: 'POST',
        body: JSON.stringify({ userId, role }),
        ...(existingSessionToken ? bearerHeaders(existingSessionToken) : {}),
      }),

    getMe: (sessionToken: string) =>
      request<AuthenticatedSession>(baseUrl, '/api/auth/me', bearerHeaders(sessionToken)),
    logout: (sessionToken: string) =>
      request<{ ok: true }>(baseUrl, '/api/auth/logout', {
        method: 'POST',
        ...bearerHeaders(sessionToken),
      }),

    startEmailLogin: (email: string, deviceId: string) =>
      request<{ deviceToken: string; deviceEncryptionKey: string; otpToken: string }>(
        baseUrl,
        '/api/auth/email/start',
        { method: 'POST', body: JSON.stringify({ email, deviceId }) },
      ),
    resendEmailLoginOtp: (email: string, deviceId: string, otpToken: string) =>
      request<{ ok: true }>(baseUrl, '/api/auth/email/resend', {
        method: 'POST',
        body: JSON.stringify({ email, deviceId, otpToken }),
      }),
    completeEmailLogin: (
      email: string,
      role: 'auditor' | 'supplier' | 'admin',
      otpUserToken: string,
    ) =>
      request<{ sessionToken: string }>(baseUrl, '/api/auth/email/complete', {
        method: 'POST',
        body: JSON.stringify({ email, role, otpUserToken }),
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

    createTransferChallenge: (
      userId: string,
      input: { userToken: string; walletId: string; destinationAddress: string; amount: string },
    ) =>
      request<{ challengeId: string }>(
        baseUrl,
        `/api/wallet-sessions/${userId}/transfer-challenge`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
