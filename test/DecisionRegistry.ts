import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anyValue } from '@nomicfoundation/hardhat-viem-assertions/predicates';
import { network } from 'hardhat';
import { keccak256, toHex } from 'viem';

void describe('DecisionRegistry', async function () {
  const { viem } = await network.create();
  const [recorderClient] = await viem.getWalletClients();
  assert.ok(recorderClient);

  const deploy = async () => viem.deployContract('DecisionRegistry');

  const decisionId = keccak256(toHex('fraud-resolution:7'));
  const contentHash = keccak256(toHex('reward=7,status=approved'));

  void it('records a decision and emits DecisionRecorded', async function () {
    const decisionRegistry = await deploy();

    await viem.assertions.emitWithArgs(
      decisionRegistry.write.recordDecision([decisionId, contentHash, 0]),
      decisionRegistry,
      'DecisionRecorded',
      [decisionId, contentHash, 0, recorderClient.account.address, anyValue],
    );

    assert.equal(await decisionRegistry.read.getContentHash([decisionId]), contentHash);
  });

  void it('rejects recording the same decisionId twice', async function () {
    const decisionRegistry = await deploy();
    await decisionRegistry.write.recordDecision([decisionId, contentHash, 0]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      decisionRegistry.write.recordDecision([decisionId, contentHash, 0]),
      decisionRegistry,
      'DecisionAlreadyRecorded',
      [decisionId],
    );
  });

  void it('returns a zero hash for an unrecorded decisionId', async function () {
    const decisionRegistry = await deploy();
    assert.equal(await decisionRegistry.read.getContentHash([decisionId]), `0x${'0'.repeat(64)}`);
  });
});
