/**
 * ABI for `AttestationRegistry.sol`.
 *
 * Kept in sync with `contracts/AttestationRegistry.sol` by hand for this milestone.
 * If the contract's public interface changes, mirror the change here (or wire up
 * `npm run contract:compile` to regenerate this file from the compiled artifact).
 */
export const attestationRegistryAbi = [
  {
    type: 'function',
    name: 'submitAttestation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'supplier', type: 'address' },
      { name: 'proofHash', type: 'bytes32' },
      { name: 'policyId', type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getAttestation',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'supplier', type: 'address' },
          { name: 'auditor', type: 'address' },
          { name: 'proofHash', type: 'bytes32' },
          { name: 'policyId', type: 'uint256' },
          { name: 'timestamp', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'event',
    name: 'AttestationSubmitted',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'supplier', type: 'address', indexed: true },
      { name: 'auditor', type: 'address', indexed: true },
      { name: 'policyId', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'DuplicateProofHash',
    inputs: [{ name: 'proofHash', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'AttestationNotFound',
    inputs: [{ name: 'id', type: 'uint256' }],
  },
] as const;
