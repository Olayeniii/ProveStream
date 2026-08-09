// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

import {IRewardPolicy} from './interfaces/IRewardPolicy.sol';

/// @title RewardPolicy
/// @notice Owner-configurable reward policies, keyed by the same `policyId` that
/// auditors reference when submitting an attestation to `AttestationRegistry`.
/// @dev Policies are configurable without redeploying contracts: the owner (protocol
/// admin) creates, updates, and disables policies here; `RewardDispatcher` reads them
/// to decide whether and how much to reward. `rewardAmount` is denominated in the
/// smallest unit of Arc's native USDC (18 decimals), matching the chain's native
/// gas token precision.
contract RewardPolicy is IRewardPolicy, Ownable {
    event PolicyCreated(uint256 indexed id, bytes32 indexed credentialType, uint256 rewardAmount);
    event PolicyUpdated(uint256 indexed id, uint256 rewardAmount);
    event PolicyDisabled(uint256 indexed id);

    error PolicyNotFound(uint256 id);
    error InvalidRewardAmount();

    /// @dev Policy ids are assigned sequentially starting at 1, so 0 is a safe
    /// "not found" sentinel for `_policies[id].id`.
    uint256 private _nextId = 1;

    mapping(uint256 => Policy) private _policies;

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Creates a new reward policy.
    /// @param credentialType Identifier for the credential/attestation category this policy rewards.
    /// @param rewardAmount Reward amount in the smallest unit of the native token. Must be positive.
    /// @param cooldownSeconds Minimum seconds between two dispatched rewards for the same
    /// supplier under this policy. 0 means no cooldown. Set once at creation, like `credentialType`.
    /// @param maxRewardsPerSupplier Maximum number of rewards a single supplier may ever receive
    /// under this policy. 0 means unlimited. Set once at creation, like `credentialType`.
    /// @return id The id assigned to the new policy.
    function createPolicy(
        bytes32 credentialType,
        uint256 rewardAmount,
        uint256 cooldownSeconds,
        uint256 maxRewardsPerSupplier
    ) external onlyOwner returns (uint256 id) {
        if (rewardAmount == 0) {
            revert InvalidRewardAmount();
        }

        id = _nextId;
        unchecked {
            _nextId = id + 1;
        }

        _policies[id] = Policy({
            id: id,
            credentialType: credentialType,
            rewardAmount: rewardAmount,
            enabled: true,
            createdAt: block.timestamp,
            cooldownSeconds: cooldownSeconds,
            maxRewardsPerSupplier: maxRewardsPerSupplier
        });

        emit PolicyCreated(id, credentialType, rewardAmount);
    }

    /// @notice Updates the reward amount of an existing policy.
    function updatePolicy(uint256 id, uint256 rewardAmount) external onlyOwner {
        if (rewardAmount == 0) {
            revert InvalidRewardAmount();
        }

        Policy storage policy = _requirePolicy(id);
        policy.rewardAmount = rewardAmount;

        emit PolicyUpdated(id, rewardAmount);
    }

    /// @notice Disables a policy so it no longer qualifies attestations for a reward.
    /// @dev Policies are never deleted, so historical rewards remain auditable.
    function disablePolicy(uint256 id) external onlyOwner {
        Policy storage policy = _requirePolicy(id);
        policy.enabled = false;

        emit PolicyDisabled(id);
    }

    /// @inheritdoc IRewardPolicy
    function getPolicy(uint256 id) external view returns (Policy memory) {
        return _requirePolicy(id);
    }

    function _requirePolicy(uint256 id) private view returns (Policy storage policy) {
        policy = _policies[id];
        if (policy.id == 0) {
            revert PolicyNotFound(id);
        }
    }
}
