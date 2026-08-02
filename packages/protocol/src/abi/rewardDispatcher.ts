/**
 * ABI for `RewardDispatcher.sol`.
 *
 * Kept in sync with `contracts/RewardDispatcher.sol` by hand for this milestone.
 */
export const rewardDispatcherAbi = [
  {
    type: 'function',
    name: 'dispatchReward',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'attestationId', type: 'uint256' }],
    outputs: [{ name: 'rewardId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isDispatched',
    stateMutability: 'view',
    inputs: [{ name: 'attestationId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'attestationRegistry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'rewardPolicy',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'event',
    name: 'RewardEligible',
    inputs: [
      { name: 'rewardId', type: 'uint256', indexed: true },
      { name: 'supplier', type: 'address', indexed: true },
      { name: 'policyId', type: 'uint256', indexed: true },
      { name: 'rewardAmount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AlreadyDispatched',
    inputs: [{ name: 'attestationId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'PolicyNotEnabled',
    inputs: [{ name: 'policyId', type: 'uint256' }],
  },
] as const;
