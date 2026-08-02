// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAttestationRegistry} from './interfaces/IAttestationRegistry.sol';
import {IRewardPolicy} from './interfaces/IRewardPolicy.sol';

/// @title RewardDispatcher
/// @notice Cross-references a submitted attestation against its reward policy and, if
/// eligible, emits `RewardEligible` for the off-chain Autonomous Settlement Agent to
/// act on.
/// @dev This contract never holds funds — it only validates eligibility and prevents
/// duplicate rewards per attestation. The actual USDC transfer happens off-chain via
/// the agent's Developer Controlled Wallet, triggered by the event emitted here.
contract RewardDispatcher {
    event RewardEligible(
        uint256 indexed rewardId,
        address indexed supplier,
        uint256 indexed policyId,
        uint256 rewardAmount
    );

    error AlreadyDispatched(uint256 attestationId);
    error PolicyNotEnabled(uint256 policyId);

    IAttestationRegistry public immutable attestationRegistry;
    IRewardPolicy public immutable rewardPolicy;

    /// @dev Reward ids are assigned sequentially starting at 1.
    uint256 private _nextRewardId = 1;

    mapping(uint256 attestationId => bool dispatched) private _dispatched;

    constructor(address attestationRegistryAddress, address rewardPolicyAddress) {
        attestationRegistry = IAttestationRegistry(attestationRegistryAddress);
        rewardPolicy = IRewardPolicy(rewardPolicyAddress);
    }

    /// @notice Validates and dispatches the reward for a submitted attestation.
    /// @dev Permissionless: eligibility is fully determined by on-chain state
    /// (the attestation's policy and prior dispatch status), so anyone — typically
    /// the autonomous agent — can call this once per attestation.
    /// @param attestationId The id of the attestation to evaluate, from `AttestationRegistry`.
    /// @return rewardId The id assigned to the emitted reward.
    function dispatchReward(uint256 attestationId) external returns (uint256 rewardId) {
        if (_dispatched[attestationId]) {
            revert AlreadyDispatched(attestationId);
        }

        IAttestationRegistry.Attestation memory attestation = attestationRegistry.getAttestation(
            attestationId
        );
        IRewardPolicy.Policy memory policy = rewardPolicy.getPolicy(attestation.policyId);

        if (!policy.enabled) {
            revert PolicyNotEnabled(attestation.policyId);
        }

        _dispatched[attestationId] = true;

        rewardId = _nextRewardId;
        unchecked {
            _nextRewardId = rewardId + 1;
        }

        emit RewardEligible(
            rewardId,
            attestation.supplier,
            attestation.policyId,
            policy.rewardAmount
        );
    }

    /// @notice Returns whether a reward has already been dispatched for `attestationId`.
    function isDispatched(uint256 attestationId) external view returns (bool) {
        return _dispatched[attestationId];
    }
}
