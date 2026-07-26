import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { network } from 'hardhat';
import { getAddress, keccak256, toHex } from 'viem';

void describe('AttestationRegistry', async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [supplierClient, auditorClient] = await viem.getWalletClients();
  assert.ok(supplierClient);
  assert.ok(auditorClient);

  async function deploy() {
    return viem.deployContract('AttestationRegistry');
  }

  void it('records an attestation and returns its assigned id', async function () {
    const registry = await deploy();
    const proofHash = keccak256(toHex('evidence-1'));

    await viem.assertions.emitWithArgs(
      registry.write.submitAttestation([supplierClient.account.address, proofHash, 1n], {
        account: auditorClient.account,
      }),
      registry,
      'AttestationSubmitted',
      [1n, supplierClient.account.address, auditorClient.account.address, 1n],
    );

    const attestation = await registry.read.getAttestation([1n]);

    assert.equal(attestation.id, 1n);
    assert.equal(getAddress(attestation.supplier), getAddress(supplierClient.account.address));
    assert.equal(getAddress(attestation.auditor), getAddress(auditorClient.account.address));
    assert.equal(attestation.proofHash, proofHash);
    assert.equal(attestation.policyId, 1n);
    assert.ok(attestation.timestamp > 0n);
  });

  void it('assigns sequential ids across multiple attestations', async function () {
    const registry = await deploy();

    await registry.write.submitAttestation(
      [supplierClient.account.address, keccak256(toHex('evidence-a')), 1n],
      { account: auditorClient.account },
    );
    await registry.write.submitAttestation(
      [supplierClient.account.address, keccak256(toHex('evidence-b')), 2n],
      { account: auditorClient.account },
    );

    const first = await registry.read.getAttestation([1n]);
    const second = await registry.read.getAttestation([2n]);

    assert.equal(first.policyId, 1n);
    assert.equal(second.policyId, 2n);
  });

  void it('rejects a duplicate proof hash', async function () {
    const registry = await deploy();
    const proofHash = keccak256(toHex('evidence-duplicate'));

    await registry.write.submitAttestation([supplierClient.account.address, proofHash, 1n], {
      account: auditorClient.account,
    });

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.submitAttestation([supplierClient.account.address, proofHash, 2n], {
        account: auditorClient.account,
      }),
      registry,
      'DuplicateProofHash',
      [proofHash],
    );
  });

  void it('reverts when reading an attestation that was never submitted', async function () {
    const registry = await deploy();

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.read.getAttestation([42n]),
      registry,
      'AttestationNotFound',
      [42n],
    );
  });

  void it('reflects the block timestamp the attestation was mined in', async function () {
    const registry = await deploy();
    const proofHash = keccak256(toHex('evidence-timestamp'));

    const hash = await registry.write.submitAttestation(
      [supplierClient.account.address, proofHash, 3n],
      { account: auditorClient.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });

    const attestation = await registry.read.getAttestation([1n]);
    assert.equal(attestation.timestamp, block.timestamp);
  });
});
