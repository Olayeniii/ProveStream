// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title AttestationRegistry
/// @notice Records auditor-signed attestations about a supplier's compliance with a
/// reward policy. This is the on-chain source of truth that the off-chain agent
/// watches in order to evaluate payout eligibility in later milestones.
/// @dev Milestone 1 scope: recording and de-duplicating attestations only. No payout
/// or treasury logic is implemented here yet.
contract AttestationRegistry {
    /// @notice A single attestation record.
    struct Attestation {
        uint256 id;
        address supplier;
        address auditor;
        bytes32 proofHash;
        uint256 policyId;
        uint256 timestamp;
    }

    /// @notice Emitted whenever a new attestation is recorded.
    event AttestationSubmitted(
        uint256 indexed id,
        address indexed supplier,
        address indexed auditor,
        uint256 policyId
    );

    /// @notice Thrown when `proofHash` has already been used by a prior attestation.
    error DuplicateProofHash(bytes32 proofHash);

    /// @notice Thrown when `getAttestation` is called with an id that was never assigned.
    error AttestationNotFound(uint256 id);

    /// @dev Attestation ids are assigned sequentially starting at 1, so 0 is a safe
    /// "not found" sentinel for `attestations[id].id`.
    uint256 private _nextId = 1;

    mapping(uint256 => Attestation) private _attestations;
    mapping(bytes32 => bool) private _usedProofHashes;

    /// @notice Records a new attestation on behalf of `supplier`.
    /// @dev The caller is recorded as the `auditor`. Reverts with `DuplicateProofHash`
    /// if `proofHash` was already recorded by a previous attestation.
    /// @param supplier The address of the supplier being attested for.
    /// @param proofHash A content hash of the off-chain evidence backing this attestation.
    /// @param policyId The reward policy this attestation is evaluated against.
    /// @return id The id assigned to the newly recorded attestation.
    function submitAttestation(
        address supplier,
        bytes32 proofHash,
        uint256 policyId
    ) external returns (uint256 id) {
        if (_usedProofHashes[proofHash]) {
            revert DuplicateProofHash(proofHash);
        }
        _usedProofHashes[proofHash] = true;

        id = _nextId;
        unchecked {
            _nextId = id + 1;
        }

        _attestations[id] = Attestation({
            id: id,
            supplier: supplier,
            auditor: msg.sender,
            proofHash: proofHash,
            policyId: policyId,
            timestamp: block.timestamp
        });

        emit AttestationSubmitted(id, supplier, msg.sender, policyId);
    }

    /// @notice Returns the attestation recorded under `id`.
    /// @dev Reverts with `AttestationNotFound` if `id` was never assigned.
    function getAttestation(uint256 id) external view returns (Attestation memory) {
        Attestation memory attestation = _attestations[id];
        if (attestation.id == 0) {
            revert AttestationNotFound(id);
        }
        return attestation;
    }
}
