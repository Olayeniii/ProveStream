import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('ThresholdVerifierModule', (m) => {
  const thresholdVerifier = m.contract('ThresholdVerifier');
  return { thresholdVerifier };
});
