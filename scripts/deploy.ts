import { network } from 'hardhat';

import AttestationRegistryModule from '../ignition/modules/AttestationRegistry.js';

async function main() {
  const { ignition } = await network.connect();

  const { attestationRegistry } = await ignition.deploy(AttestationRegistryModule);

  console.log('AttestationRegistry deployed to:', attestationRegistry.address);
  console.log('Set CONTRACT_ADDRESS / VITE_CONTRACT_ADDRESS in your .env to this value.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
