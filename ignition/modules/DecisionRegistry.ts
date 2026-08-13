import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

export default buildModule('DecisionRegistryModule', (m) => {
  const decisionRegistry = m.contract('DecisionRegistry');
  return { decisionRegistry };
});
