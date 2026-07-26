import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('AttestationRegistryModule', (m) => {
  const attestationRegistry = m.contract('AttestationRegistry');

  return { attestationRegistry };
});
