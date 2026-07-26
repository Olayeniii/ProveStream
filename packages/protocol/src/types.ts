import type { Address, GetEventArgs, Hex } from 'viem';

import type { attestationRegistryAbi } from './abi/attestationRegistry.js';

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
