// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IRewardPolicy
/// @notice External interface for `RewardPolicy`, used by contracts that need to read
/// policy configuration without depending on its full implementation.
interface IRewardPolicy {
    struct Policy {
        uint256 id;
        bytes32 credentialType;
        uint256 rewardAmount;
        bool enabled;
        uint256 createdAt;
        /// @dev Minimum seconds between two dispatched rewards for the same supplier
        /// under this policy. 0 means no cooldown.
        uint256 cooldownSeconds;
        /// @dev Maximum number of rewards a single supplier may receive under this
        /// policy, ever. 0 means unlimited.
        uint256 maxRewardsPerSupplier;
    }

    function getPolicy(uint256 id) external view returns (Policy memory);
}
