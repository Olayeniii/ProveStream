import { attestationRegistryAbi } from '@provenance-streams/protocol';
import type { Address } from 'viem';
import { createPublicClient, http } from 'viem';

import { withRpcRetries } from './rpcRetry.js';

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
      // Goes through the shared pacer like every other RPC-heavy service —
      // callers that scan a range of ids (e.g. `tryAnalyzeRiskForNewEvidence`'s
      // fallback scan) fire many of these back to back, and without the
      // shared gate they compete unpaced against Arc testnet's rate limit
      // exactly like an unpaced `eth_getLogs` burst would.
      const attestation = await withRpcRetries(() =>
        client.readContract({
          address: config.attestationRegistryAddress,
          abi: attestationRegistryAbi,
          functionName: 'getAttestation',
          args: [id],
        }),
      );
      return attestation.proofHash;
    },
  };
}
