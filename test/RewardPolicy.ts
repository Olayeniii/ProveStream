import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { network } from 'hardhat';
import { keccak256, toHex } from 'viem';

void describe('RewardPolicy', async function () {
  const { viem } = await network.create();
  const [ownerClient, strangerClient] = await viem.getWalletClients();
  assert.ok(ownerClient);
  assert.ok(strangerClient);

  const credentialType = keccak256(toHex('ISO-9001'));

  const deploy = async () => {
    return viem.deployContract('RewardPolicy', [ownerClient.account.address]);
  };

  void it('creates a policy and returns it via getPolicy', async function () {
    const rewardPolicy = await deploy();

    await viem.assertions.emitWithArgs(
      rewardPolicy.write.createPolicy([credentialType, 100n, 0n, 0n]),
      rewardPolicy,
      'PolicyCreated',
      [1n, credentialType, 100n],
    );

    const policy = await rewardPolicy.read.getPolicy([1n]);
    assert.equal(policy.id, 1n);
    assert.equal(policy.credentialType, credentialType);
    assert.equal(policy.rewardAmount, 100n);
    assert.equal(policy.enabled, true);
    assert.ok(policy.createdAt > 0n);
    assert.equal(policy.cooldownSeconds, 0n);
    assert.equal(policy.maxRewardsPerSupplier, 0n);
  });

  void it('stores a non-zero cooldown and per-supplier cap', async function () {
    const rewardPolicy = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 100n, 3600n, 5n]);

    const policy = await rewardPolicy.read.getPolicy([1n]);
    assert.equal(policy.cooldownSeconds, 3600n);
    assert.equal(policy.maxRewardsPerSupplier, 5n);
  });

  void it('rejects policy creation from a non-owner', async function () {
    const rewardPolicy = await deploy();

    await viem.assertions.revertWithCustomError(
      rewardPolicy.write.createPolicy([credentialType, 100n, 0n, 0n], {
        account: strangerClient.account,
      }),
      rewardPolicy,
      'OwnableUnauthorizedAccount',
    );
  });

  void it('rejects a zero reward amount', async function () {
    const rewardPolicy = await deploy();

    await viem.assertions.revertWithCustomError(
      rewardPolicy.write.createPolicy([credentialType, 0n, 0n, 0n]),
      rewardPolicy,
      'InvalidRewardAmount',
    );
  });

  void it('updates the reward amount of an existing policy', async function () {
    const rewardPolicy = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 100n, 0n, 0n]);

    await viem.assertions.emitWithArgs(
      rewardPolicy.write.updatePolicy([1n, 250n]),
      rewardPolicy,
      'PolicyUpdated',
      [1n, 250n],
    );

    const policy = await rewardPolicy.read.getPolicy([1n]);
    assert.equal(policy.rewardAmount, 250n);
  });

  void it('disables a policy', async function () {
    const rewardPolicy = await deploy();
    await rewardPolicy.write.createPolicy([credentialType, 100n, 0n, 0n]);

    await viem.assertions.emitWithArgs(
      rewardPolicy.write.disablePolicy([1n]),
      rewardPolicy,
      'PolicyDisabled',
      [1n],
    );

    const policy = await rewardPolicy.read.getPolicy([1n]);
    assert.equal(policy.enabled, false);
  });

  void it('reverts when reading a policy that was never created', async function () {
    const rewardPolicy = await deploy();

    await viem.assertions.revertWithCustomErrorWithArgs(
      rewardPolicy.read.getPolicy([42n]),
      rewardPolicy,
      'PolicyNotFound',
      [42n],
    );
  });
});
