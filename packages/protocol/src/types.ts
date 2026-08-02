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
}
