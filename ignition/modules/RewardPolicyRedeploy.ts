import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

/**
 * Redeploys only `RewardPolicy` and `RewardDispatcher` — not
 * `AttestationRegistry`, which is unchanged and already holds real attestation
 * history on Arc testnet. Redeploying it too would orphan that history and
 * break `HistoryService`'s persisted scan cursor for no reason. Point at the
 * existing `AttestationRegistry` address via the `attestationRegistryAddress`
 * parameter (see `ignition/parameters/rewardPolicyRedeploy.json`).
 */
export default buildModule('RewardPolicyRedeployModule', (m) => {
  const owner = m.getAccount(0);
  const attestationRegistryAddress = m.getParameter('attestationRegistryAddress');

  const rewardPolicy = m.contract('RewardPolicy', [owner]);
  const rewardDispatcher = m.contract('RewardDispatcher', [
    attestationRegistryAddress,
    rewardPolicy,
  ]);

  return { rewardPolicy, rewardDispatcher };
});
