/**
 * ABI for `DecisionRegistry.sol`.
 *
 * Kept in sync with `contracts/DecisionRegistry.sol` by hand for this milestone.
 * If the contract's public interface changes, mirror the change here (or wire up
 * `npm run contract:compile` to regenerate this file from the compiled artifact).
 */
export const decisionRegistryAbi = [
  {
    type: 'function',
    name: 'recordDecision',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'decisionId', type: 'bytes32' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'decisionType', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getContentHash',
    stateMutability: 'view',
    inputs: [{ name: 'decisionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'event',
    name: 'DecisionRecorded',
    inputs: [
      { name: 'decisionId', type: 'bytes32', indexed: true },
      { name: 'contentHash', type: 'bytes32', indexed: false },
      { name: 'decisionType', type: 'uint8', indexed: true },
      { name: 'recorder', type: 'address', indexed: true },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'DecisionAlreadyRecorded',
    inputs: [{ name: 'decisionId', type: 'bytes32' }],
  },
] as const;
