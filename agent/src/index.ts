import { type AgentConfigInput, parseAgentConfig } from './config.js';
import { createLogger } from './logger.js';
import { evaluateReward } from './rewardEngine.js';
import { type StopWatcher, watchAttestations } from './watcher.js';

export type { AgentConfig, AgentConfigInput } from './config.js';
export { createLogger, type Logger } from './logger.js';
export { evaluateReward, type RewardDecision } from './rewardEngine.js';
export {
  type AttestationSubmittedHandler,
  type StopWatcher,
  watchAttestations,
} from './watcher.js';

const logger = createLogger('agent');

/**
 * Starts the autonomous agent: watches `AttestationSubmitted` events on the
 * configured `AttestationRegistry` deployment, logs each one, and evaluates
 * it against the reward policy rule.
 */
export function runAgent(configInput: AgentConfigInput): StopWatcher {
  const config = parseAgentConfig(configInput);

  logger.info('Watching for attestations', {
    contractAddress: config.contractAddress,
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
  });

  return watchAttestations(config, (attestation) => {
    logger.info('Attestation submitted', {
      id: attestation.id?.toString(),
      supplier: attestation.supplier,
      auditor: attestation.auditor,
      policyId: attestation.policyId?.toString(),
    });

    const decision = evaluateReward(attestation);
    if (decision.eligible) {
      logger.info(decision.reason);
    } else {
      logger.warn(decision.reason);
    }
  });
}
