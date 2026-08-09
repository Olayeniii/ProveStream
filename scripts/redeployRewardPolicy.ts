import { network } from 'hardhat';

import RewardPolicyRedeployModule from '../ignition/modules/RewardPolicyRedeploy.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file present; fall back to whatever is already in process.env.
}

async function main() {
  const attestationRegistryAddress = process.env.CONTRACT_ADDRESS;
  if (!attestationRegistryAddress) {
    throw new Error(
      'CONTRACT_ADDRESS must be set in .env — this redeploy targets the existing AttestationRegistry.',
    );
  }

  const { ignition } = await network.connect();

  const { rewardPolicy, rewardDispatcher } = await ignition.deploy(RewardPolicyRedeployModule, {
    parameters: {
      RewardPolicyRedeployModule: { attestationRegistryAddress },
    },
  });

  console.log('AttestationRegistry (unchanged):', attestationRegistryAddress);
  console.log('RewardPolicy redeployed to:', rewardPolicy.address);
  console.log('RewardDispatcher redeployed to:', rewardDispatcher.address);
  console.log('\nUpdate .env / .env.example with:');
  console.log(`  REWARD_POLICY_ADDRESS=${rewardPolicy.address}`);
  console.log(`  VITE_REWARD_POLICY_ADDRESS=${rewardPolicy.address}`);
  console.log(`  REWARD_DISPATCHER_ADDRESS=${rewardDispatcher.address}`);
  console.log(`  VITE_REWARD_DISPATCHER_ADDRESS=${rewardDispatcher.address}`);
  console.log(
    '  REWARD_POLICY_DEPLOYED_AT_BLOCK=<current block, printed by the deploy tx receipt above>',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
