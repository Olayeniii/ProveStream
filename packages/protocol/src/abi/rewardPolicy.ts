/**
 * ABI for `RewardPolicy.sol`.
 *
 * Kept in sync with `contracts/RewardPolicy.sol` by hand for this milestone.
 */
export const rewardPolicyAbi = [
  {
    type: 'function',
    name: 'createPolicy',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'credentialType', type: 'bytes32' },
      { name: 'rewardAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'updatePolicy',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'rewardAmount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'disablePolicy',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getPolicy',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'credentialType', type: 'bytes32' },
          { name: 'rewardAmount', type: 'uint256' },
          { name: 'enabled', type: 'bool' },
          { name: 'createdAt', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'event',
    name: 'PolicyCreated',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'credentialType', type: 'bytes32', indexed: true },
      { name: 'rewardAmount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PolicyUpdated',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'rewardAmount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PolicyDisabled',
    inputs: [{ name: 'id', type: 'uint256', indexed: true }],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'PolicyNotFound',
    inputs: [{ name: 'id', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'InvalidRewardAmount',
    inputs: [],
  },
  {
    type: 'error',
    name: 'OwnableUnauthorizedAccount',
    inputs: [{ name: 'account', type: 'address' }],
  },
] as const;
