// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title DecisionRegistry
/// @notice Anchors a content hash of an off-chain economic decision, making it
/// tamper-evident. Does not store decision content itself — only commits to
/// it, so anyone can recompute the hash from the current off-chain record
/// and compare it against what was anchored at decision time.
/// @dev `decisionType` is a generic tag so more decision kinds (e.g. AI risk
/// analysis results) can reuse this same contract later without a redeploy.
contract DecisionRegistry {
    /// @notice Emitted whenever a new decision is anchored.
    event DecisionRecorded(
        bytes32 indexed decisionId,
        bytes32 contentHash,
        uint8 indexed decisionType,
        address indexed recorder,
        uint256 timestamp
    );

    /// @notice Thrown when `decisionId` has already been recorded.
    error DecisionAlreadyRecorded(bytes32 decisionId);

    mapping(bytes32 => bytes32) private _contentHashes;

    /// @notice Anchors `contentHash` under `decisionId`.
    /// @dev Permissionless, matching `RewardDispatcher.dispatchReward`'s
    /// existing philosophy in this codebase. Writing a wrong hash doesn't
    /// let an attacker forge history: verifiers recompute the hash
    /// themselves from the real off-chain record and compare, so a bad
    /// write is just inert noise, not a usable forgery.
    /// @param decisionId Unique identifier for the decision being anchored.
    /// @param contentHash `keccak256` of the decision's canonical off-chain content.
    /// @param decisionType Tag identifying what kind of decision this is.
    function recordDecision(bytes32 decisionId, bytes32 contentHash, uint8 decisionType) external {
        if (_contentHashes[decisionId] != bytes32(0)) {
            revert DecisionAlreadyRecorded(decisionId);
        }

        _contentHashes[decisionId] = contentHash;

        emit DecisionRecorded(decisionId, contentHash, decisionType, msg.sender, block.timestamp);
    }

    /// @notice Returns the content hash anchored under `decisionId`, or `bytes32(0)` if none.
    function getContentHash(bytes32 decisionId) external view returns (bytes32) {
        return _contentHashes[decisionId];
    }
}
