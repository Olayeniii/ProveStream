import type { Address, GetEventArgs, Hex } from 'viem';

import type { attestationRegistryAbi } from './abi/attestationRegistry.js';
import type { rewardDispatcherAbi } from './abi/rewardDispatcher.js';
import type { rewardPolicyAbi } from './abi/rewardPolicy.js';

/** An attestation as stored on-chain, decoded from `getAttestation`. */
export interface Attestation {
  id: bigint;
  supplier: Address;
  auditor: Address;
  proofHash: Hex;
  policyId: bigint;
  timestamp: bigint;
}

/** Decoded arguments of an `AttestationSubmitted` event log. */
export type AttestationSubmittedEventArgs = GetEventArgs<
  typeof attestationRegistryAbi,
  'AttestationSubmitted',
  { EnableUnion: false }
>;

/** A reward policy as stored on-chain, decoded from `getPolicy`. */
export interface RewardPolicyRecord {
  id: bigint;
  credentialType: Hex;
  rewardAmount: bigint;
  enabled: boolean;
  createdAt: bigint;
}

/** Decoded arguments of a `RewardEligible` event log. */
export type RewardEligibleEventArgs = GetEventArgs<
  typeof rewardDispatcherAbi,
  'RewardEligible',
  { EnableUnion: false }
>;

/** Decoded arguments of a `PolicyCreated` event log. */
export type PolicyCreatedEventArgs = GetEventArgs<
  typeof rewardPolicyAbi,
  'PolicyCreated',
  { EnableUnion: false }
>;

/** Lifecycle status of an off-chain-executed settlement payment. */
export type PaymentStatus = 'pending' | 'complete' | 'failed';

/**
 * A settlement payment record, tracked off-chain by the agent from the moment a
 * `RewardEligible` event is observed through completion of the USDC transfer.
 * Exposed to the frontend by the backend's `/api/payments` endpoint.
 */
export interface Payment {
  rewardId: string;
  attestationId: string;
  supplier: Address;
  policyId: string;
  rewardAmount: string;
  status: PaymentStatus;
  txHash?: Hex;
  error?: string;
  createdAt: string;
  updatedAt: string;
  /** Set when this payment settled via cross-chain bridge (Circle CCTP) rather than a direct same-chain transfer. */
  bridged?: boolean;
  /** The chain the supplier's destination wallet is on, when `bridged` is true (e.g. `Ethereum_Sepolia`). */
  destinationChain?: string;
  /** The transaction hash of the mint on the destination chain, when known. */
  destinationTxHash?: Hex;
}

/** Lifecycle status of an AI risk-analysis pass over an attestation's submitted evidence. */
export type RiskAnalysisStatus = 'pending' | 'complete' | 'failed';

/**
 * The result of sending an attestation's submitted evidence text to the
 * configured AI risk-analysis service (Gemini). Only created when both the
 * evidence text and the on-chain attestation are known, and only if
 * `GEMINI_API_KEY` is configured on the backend — exposed via
 * `/api/risk-analyses`.
 */
export interface RiskAnalysis {
  attestationId: string;
  status: RiskAnalysisStatus;
  /** Fraud-risk score, 0-100, higher = riskier. Only present once `status` is `complete`. */
  score?: number;
  /** The model's confidence in its own score, 0-100. Only present once `status` is `complete`. */
  confidence?: number;
  summary?: string;
  /** Which model actually produced this result (e.g. "Gemini", "DeepSeek R1 (NVIDIA)") — visible so a fallback provider firing is transparent, not hidden. Only present once `status` is `complete`. */
  provider?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** Lifecycle status of independently verifying an attestation transaction's signature. */
export type SignatureVerificationStatus = 'pending' | 'complete' | 'failed';

/**
 * Independent cryptographic verification that the address `AttestationRegistry`
 * recorded as `auditor` is the one that actually signed the `submitAttestation`
 * transaction — recovered from the transaction's own signature (`recoverTransactionAddress`),
 * not just trusted from what the RPC reports as `from`. Exposed via
 * `/api/signature-verifications`.
 */
export interface SignatureVerification {
  attestationId: string;
  status: SignatureVerificationStatus;
  /** The address independently recovered from the transaction's signature. Only present once `status` is `complete`. */
  signerAddress?: Address;
  /** True once `signerAddress` is confirmed to equal the attestation's on-chain `auditor` field. Only present once `status` is `complete`. */
  verified?: boolean;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/** A supplier's registered off-chain preference for cross-chain settlement. */
export interface DestinationWallet {
  supplier: Address;
  chain: string;
  address: Address;
  registeredAt: string;
}

/** Lifecycle of a supplier's submitted evidence, from submission to an auditor acting on it. */
export type EvidenceSubmissionStatus = 'pending' | 'attested' | 'rejected';

/**
 * Evidence a supplier submits ahead of time, for an auditor to review and
 * attest to — closes the gap where an auditor previously had no channel from
 * the supplier and typed evidence in from scratch. `proofHash` is computed
 * server-side from `evidenceText` at submission time (`keccak256(toHex(...))`,
 * matching what `AttestationRegistry` expects on-chain), so the auditor's
 * "Attest" action can reuse it exactly rather than re-hashing.
 */
export interface EvidenceSubmission {
  id: string;
  supplier: Address;
  policyId: string;
  proofHash: Hex;
  evidenceText: string;
  status: EvidenceSubmissionStatus;
  createdAt: string;
  updatedAt: string;
  /** Set once an auditor attests using this submission's `proofHash`. */
  attestationId?: string;
}

/** Lifecycle of a payout the agent's fraud checks held for admin review. */
export type FraudAlertStatus = 'flagged' | 'approved' | 'rejected';

/**
 * A payout the agent's rule-based `FraudService` flagged instead of
 * auto-dispatching, surfaced on the Admin dashboard for a human decision.
 * Created from `RunAgentHooks.onFraudFlagged`; `approve` re-enqueues the
 * held settlement via `AgentControl.approvePayout`, `reject` leaves it
 * unsettled permanently.
 */
export interface FraudAlert {
  rewardId: string;
  attestationId: string;
  supplier: Address;
  policyId: string;
  rewardAmount: string;
  score: number;
  reasons: string[];
  status: FraudAlertStatus;
  createdAt: string;
  updatedAt: string;
}

/** Lifecycle state of an in-flight or completed settlement job, mirroring `SettlementQueue`'s job states. */
export type SettlementJobState = 'queued' | 'processing' | 'retrying' | 'settled' | 'failed';

/** A settlement job's current state, surfaced on the Admin dashboard's settlement queue view. */
export interface SettlementJobRecord {
  rewardId: string;
  state: SettlementJobState;
  attempt?: number | undefined;
  error?: string | undefined;
  updatedAt: string;
}

/**
 * A point-in-time snapshot of the autonomous agent's operational status,
 * exposed via `/api/agent-health` for the Admin dashboard.
 */
export interface AgentHealth {
  /** Number of settlement jobs waiting or currently processing. */
  queueDepth: number;
  /** `'circle'` (real Developer-Controlled Wallet) or `'local'` (demo signer fallback). */
  treasuryMode: string;
  /** ISO timestamp of the most recent `AttestationSubmitted` or `RewardEligible` event the agent observed, if any. */
  lastEventAt?: string | undefined;
  /** Count of payouts currently held for fraud review. */
  pendingFraudAlerts: number;
}
