import { network } from 'hardhat';

import ProtocolModule from '../ignition/modules/Protocol.js';

async function main() {
  const { ignition } = await network.connect();

  const { attestationRegistry, rewardPolicy, rewardDispatcher } =
    await ignition.deploy(ProtocolModule);

  console.log('AttestationRegistry deployed to:', attestationRegistry.address);
  console.log('RewardPolicy deployed to:', rewardPolicy.address);
  console.log('RewardDispatcher deployed to:', rewardDispatcher.address);
  console.log('\nUpdate .env with:');
  console.log(`  CONTRACT_ADDRESS=${attestationRegistry.address}`);
  console.log(`  VITE_CONTRACT_ADDRESS=${attestationRegistry.address}`);
  console.log(`  REWARD_POLICY_ADDRESS=${rewardPolicy.address}`);
  console.log(`  VITE_REWARD_POLICY_ADDRESS=${rewardPolicy.address}`);
  console.log(`  REWARD_DISPATCHER_ADDRESS=${rewardDispatcher.address}`);
  console.log(`  VITE_REWARD_DISPATCHER_ADDRESS=${rewardDispatcher.address}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
