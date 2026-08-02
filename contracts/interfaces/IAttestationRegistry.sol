// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IAttestationRegistry
/// @notice External interface for `AttestationRegistry`, used by contracts that need to
/// read attestations without depending on its full implementation.
interface IAttestationRegistry {
    struct Attestation {
        uint256 id;
        address supplier;
        address auditor;
        bytes32 proofHash;
        uint256 policyId;
        uint256 timestamp;
    }

    function getAttestation(uint256 id) external view returns (Attestation memory);
}
