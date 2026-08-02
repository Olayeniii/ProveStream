import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('ProtocolModule', (m) => {
  const owner = m.getAccount(0);

  const attestationRegistry = m.contract('AttestationRegistry');
  const rewardPolicy = m.contract('RewardPolicy', [owner]);
  const rewardDispatcher = m.contract('RewardDispatcher', [attestationRegistry, rewardPolicy]);

  return { attestationRegistry, rewardPolicy, rewardDispatcher };
});
