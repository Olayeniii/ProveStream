import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { network } from 'hardhat';
import { keccak256, toHex } from 'viem';

void describe('RewardDispatcher', async function () {
  const { viem, networkHelpers } = await network.create();
  const [ownerClient, supplierClient, auditorClient] = await viem.getWalletClients();
  assert.ok(ownerClient);
  assert.ok(supplierClient);
  assert.ok(auditorClient);

  const credentialType = keccak256(toHex('ISO-9001'));

  const deploy = async () => {
    const attestationRegistry = await viem.deployContract('AttestationRegistry');
    const rewardPolicy = await viem.deployContract('RewardPolicy', [ownerClient.account.address]);
    const rewardDispatcher = await viem.deployContract('RewardDispatcher', [
      attestationRegistry.address,
      rewardPolicy.address,
    ]);
    return { attestationRegistry, rewardPolicy, rewardDispatcher };
  };

  const submitAttestation = async (
    attestationRegistry: Awaited<ReturnType<typeof deploy>>['attestationRegistry'],
    policyId: bigint,
    salt: string,
  ) => {
    await attestationRegistry.write.submitAttestation(
      [supplierClient.account.address, keccak256(toHex(salt)), policyId],
      { account: auditorClient.account },
    );
  };

  void it('dispatches a reward for an attestation under an enabled policy', async function () {
    const { attestationRegistry, rewardPolicy, rewardDispatcher } = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 500n, 0n, 0n]);
    await submitAttestation(attestationRegistry, 1n, 'evidence-1');

    await viem.assertions.emitWithArgs(
      rewardDispatcher.write.dispatchReward([1n]),
      rewardDispatcher,
      'RewardEligible',
      [1n, supplierClient.account.address, 1n, 500n],
    );

    assert.equal(await rewardDispatcher.read.isDispatched([1n]), true);
  });

  void it('rejects a second dispatch for the same attestation', async function () {
    const { attestationRegistry, rewardPolicy, rewardDispatcher } = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 500n, 0n, 0n]);
    await submitAttestation(attestationRegistry, 1n, 'evidence-1');
    await rewardDispatcher.write.dispatchReward([1n]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      rewardDispatcher.write.dispatchReward([1n]),
      rewardDispatcher,
      'AlreadyDispatched',
      [1n],
    );
  });

  void it('rejects dispatch when the referenced policy is disabled', async function () {
    const { attestationRegistry, rewardPolicy, rewardDispatcher } = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 500n, 0n, 0n]);
    await rewardPolicy.write.disablePolicy([1n]);
    await submitAttestation(attestationRegistry, 1n, 'evidence-1');

    await viem.assertions.revertWithCustomErrorWithArgs(
      rewardDispatcher.write.dispatchReward([1n]),
      rewardDispatcher,
      'PolicyNotEnabled',
      [1n],
    );
  });

  void it('reverts when the attestation does not exist', async function () {
    const { attestationRegistry, rewardDispatcher } = await deploy();

    await viem.assertions.revertWithCustomErrorWithArgs(
      rewardDispatcher.write.dispatchReward([42n]),
      attestationRegistry,
      'AttestationNotFound',
      [42n],
    );
  });

  void it('assigns sequential reward ids across multiple attestations', async function () {
    const { attestationRegistry, rewardPolicy, rewardDispatcher } = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 500n, 0n, 0n]);
    await submitAttestation(attestationRegistry, 1n, 'evidence-a');
    await submitAttestation(attestationRegistry, 1n, 'evidence-b');

    await rewardDispatcher.write.dispatchReward([1n]);
    await viem.assertions.emitWithArgs(
      rewardDispatcher.write.dispatchReward([2n]),
      rewardDispatcher,
      'RewardEligible',
      [2n, supplierClient.account.address, 1n, 500n],
    );
  });

  void it('rejects a second dispatch for the same supplier within the policy cooldown', async function () {
    const { attestationRegistry, rewardPolicy, rewardDispatcher } = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 500n, 3600n, 0n]);
    await submitAttestation(attestationRegistry, 1n, 'evidence-a');
    await submitAttestation(attestationRegistry, 1n, 'evidence-b');
    await rewardDispatcher.write.dispatchReward([1n]);

    const availableAt = BigInt(await networkHelpers.time.latest()) + 3600n;
    await viem.assertions.revertWithCustomErrorWithArgs(
      rewardDispatcher.write.dispatchReward([2n]),
      rewardDispatcher,
      'CooldownActive',
      [1n, supplierClient.account.address, availableAt],
    );
  });

  void it('allows a second dispatch once the policy cooldown has elapsed', async function () {
    const { attestationRegistry, rewardPolicy, rewardDispatcher } = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 500n, 3600n, 0n]);
    await submitAttestation(attestationRegistry, 1n, 'evidence-a');
    await submitAttestation(attestationRegistry, 1n, 'evidence-b');
    await rewardDispatcher.write.dispatchReward([1n]);

    await networkHelpers.time.increase(3600);

    await viem.assertions.emitWithArgs(
      rewardDispatcher.write.dispatchReward([2n]),
      rewardDispatcher,
      'RewardEligible',
      [2n, supplierClient.account.address, 1n, 500n],
    );
  });

  void it('rejects dispatch once a supplier hits the policy per-supplier reward cap', async function () {
    const { attestationRegistry, rewardPolicy, rewardDispatcher } = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 500n, 0n, 2n]);
    await submitAttestation(attestationRegistry, 1n, 'evidence-a');
    await submitAttestation(attestationRegistry, 1n, 'evidence-b');
    await submitAttestation(attestationRegistry, 1n, 'evidence-c');

    await rewardDispatcher.write.dispatchReward([1n]);
    await rewardDispatcher.write.dispatchReward([2n]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      rewardDispatcher.write.dispatchReward([3n]),
      rewardDispatcher,
      'MaxRewardsExceeded',
      [1n, supplierClient.account.address, 2n],
    );
  });

  void it('tracks cooldown and reward cap separately per policy', async function () {
    const { attestationRegistry, rewardPolicy, rewardDispatcher } = await deploy();
    const otherCredentialType = keccak256(toHex('ISO-14001'));
    await rewardPolicy.write.createPolicy([credentialType, 500n, 3600n, 1n]);
    await rewardPolicy.write.createPolicy([otherCredentialType, 500n, 0n, 0n]);
    await submitAttestation(attestationRegistry, 1n, 'evidence-a');
    await submitAttestation(attestationRegistry, 2n, 'evidence-b');
    await rewardDispatcher.write.dispatchReward([1n]);

    // Same supplier, but a different policy with no cooldown/cap of its own —
    // unaffected by policy 1's restrictions having just been hit.
    await viem.assertions.emitWithArgs(
      rewardDispatcher.write.dispatchReward([2n]),
      rewardDispatcher,
      'RewardEligible',
      [2n, supplierClient.account.address, 2n, 500n],
    );
  });
});
