import { attestationRegistryAbi } from '@provenance-streams/protocol';
import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';

export interface AttestationReaderConfig {
  rpcUrl: string;
  attestationRegistryAddress: Address;
}

/**
 * Reads back an attestation's `proofHash` by id. `AttestationSubmitted`'s event
 * args don't include it (only id/supplier/auditor/policyId), but the full
 * struct — including `proofHash` — is available via `getAttestation`.
 */
export function createAttestationReader(config: AttestationReaderConfig) {
  const client = createPublicClient({ transport: http(config.rpcUrl) });

  return {
    async getProofHash(id: bigint) {
      const attestation = await client.readContract({
        address: config.attestationRegistryAddress,
        abi: attestationRegistryAbi,
        functionName: 'getAttestation',
        args: [id],
      });
      return attestation.proofHash;
    },
  };
}
