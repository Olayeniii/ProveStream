import { network } from 'hardhat';

import ThresholdVerifierModule from '../ignition/modules/ThresholdVerifier.js';

async function main() {
  const { ignition } = await network.connect();
  const { thresholdVerifier } = await ignition.deploy(ThresholdVerifierModule);

  console.log('ThresholdVerifier deployed to:', thresholdVerifier.address);
  console.log('\nUpdate .env / .env.example with:');
  console.log(`  THRESHOLD_VERIFIER_ADDRESS=${thresholdVerifier.address}`);
  console.log(`  VITE_THRESHOLD_VERIFIER_ADDRESS=${thresholdVerifier.address}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
