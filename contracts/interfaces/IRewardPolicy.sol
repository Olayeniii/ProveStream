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
    }

    function getPolicy(uint256 id) external view returns (Policy memory);
}
