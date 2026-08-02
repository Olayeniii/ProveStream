import type { Hex } from 'viem';

import type {
  AttestationSubmittedEventArgs,
  RewardEligibleEventArgs,
} from '@provenance-streams/protocol';

import { type AgentConfigInput, parseAgentConfig } from './config.js';
import { dispatchRewardOnChain, watchRewardEligible } from './dispatcher.js';
import { createLogger } from './logger.js';
import { evaluateReward } from './rewardEngine.js';
import { createTreasuryService } from './treasuryService.js';
import { watchAttestations } from './watcher.js';

export { parseAgentConfig } from './config.js';
export type { AgentConfig, AgentConfigInput, TreasuryConfig } from './config.js';
export type { DispatchResult } from './dispatcher.js';
export { createLogger, type Logger } from './logger.js';
export { evaluateReward, type RewardDecision } from './rewardEngine.js';
export type {
  TreasuryBalance,
  TreasuryService,
  SendRewardInput,
  SendRewardResult,
} from './treasuryService.js';
export { createTreasuryService } from './treasuryService.js';
export type { StopWatcher } from './chainClient.js';
export type { AttestationSubmittedHandler } from './watcher.js';
export type { RewardEligibleHandler } from './dispatcher.js';

const logger = createLogger('agent');

/** Outcome of a settlement payment, reported to `RunAgentHooks.onPaymentSettled`. */
export type PaymentSettlement = { txHash: Hex } | { error: string };

export interface RewardEligibleContext {
  /** The attestation id that produced this reward, when dispatched by this agent instance. */
  attestationId: bigint | undefined;
}

export interface RunAgentHooks {
  /** Called whenever an `AttestationSubmitted` event is observed. */
  onAttestation?: (attestation: AttestationSubmittedEventArgs) => void;
  /** Called whenever a `RewardEligible` event is observed. */
  onRewardEligible?: (reward: RewardEligibleEventArgs, context: RewardEligibleContext) => void;
  /** Called once the settlement payment for `rewardId` finishes, one way or another. */
  onPaymentSettled?: (rewardId: bigint, settlement: PaymentSettlement) => void;
}

export type StopAgent = () => void;

/**
 * Starts the autonomous settlement agent:
 *
 * 1. Watches `AttestationSubmitted` on `AttestationRegistry`, evaluates the
 *    reward rule, and — if eligible — calls `RewardDispatcher.dispatchReward`
 *    on-chain using the agent's operator wallet.
 * 2. Watches `RewardEligible` on `RewardDispatcher` and executes the USDC
 *    payment through the configured `TreasuryService` (a real Circle
 *    Developer Controlled Wallet, or a local signer for the demo).
 *
 * `hooks` let the host process (e.g. `apps/backend`) track attestations and
 * payments — e.g. to serve them over HTTP — without the agent itself knowing
 * anything about persistence or transport.
 */
export function runAgent(configInput: AgentConfigInput, hooks: RunAgentHooks = {}): StopAgent {
  const config = parseAgentConfig(configInput);
  const treasuryService = createTreasuryService(config, config.treasury);

  /**
   * Bridges the two watchers: when this agent instance dispatches a reward, we
   * remember which attestation produced it so `onRewardEligible` can report
   * that lineage. `RewardEligible` itself doesn't carry the attestation id
   * (see `RewardDispatcher.sol`), so rewards dispatched by someone else (or a
   * prior agent run) simply won't have an entry here.
   */
  const attestationIdByRewardId = new Map<string, bigint>();

  logger.info('Watching for attestations', {
    attestationRegistryAddress: config.attestationRegistryAddress,
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    treasuryMode: config.treasury.mode,
  });

  const stopAttestationWatcher = watchAttestations(config, (attestation) => {
    logger.info('Attestation submitted', {
      id: attestation.id?.toString(),
      supplier: attestation.supplier,
      auditor: attestation.auditor,
      policyId: attestation.policyId?.toString(),
    });
    hooks.onAttestation?.(attestation);

    const decision = evaluateReward(attestation);
    if (!decision.eligible) {
      logger.warn(decision.reason);
      return;
    }
    logger.info(decision.reason);

    const attestationId = attestation.id;
    if (attestationId === undefined) {
      logger.error('AttestationSubmitted event is missing an id; cannot dispatch reward.');
      return;
    }

    dispatchRewardOnChain(config, attestationId, (rewardId) => {
      attestationIdByRewardId.set(rewardId.toString(), attestationId);
    })
      .then((result) => {
        if (result.status === 'dispatched') {
          logger.info('Reward dispatched on-chain', {
            attestationId: attestationId.toString(),
            rewardId: result.rewardId.toString(),
            txHash: result.txHash,
          });
        } else if (result.status === 'already-dispatched') {
          logger.warn('Reward already dispatched for this attestation', {
            attestationId: attestationId.toString(),
          });
        } else if (result.status === 'policy-not-enabled') {
          logger.warn('Policy is not enabled; reward not dispatched', {
            attestationId: attestationId.toString(),
          });
        } else {
          logger.error('Failed to dispatch reward', {
            attestationId: attestationId.toString(),
            error: result.error,
          });
        }
      })
      .catch((error: unknown) => {
        logger.error('Unexpected error dispatching reward', {
          attestationId: attestationId.toString(),
          error,
        });
      });
  });

  const stopRewardEligibleWatcher = watchRewardEligible(config, (reward) => {
    logger.info('Reward eligible', {
      rewardId: reward.rewardId?.toString(),
      supplier: reward.supplier,
      policyId: reward.policyId?.toString(),
      rewardAmount: reward.rewardAmount?.toString(),
    });
    const { rewardId, supplier, rewardAmount } = reward;
    hooks.onRewardEligible?.(reward, {
      attestationId:
        rewardId === undefined ? undefined : attestationIdByRewardId.get(rewardId.toString()),
    });

    if (rewardId === undefined || supplier === undefined || rewardAmount === undefined) {
      logger.error('RewardEligible event is missing required fields; cannot settle payment.');
      return;
    }

    treasuryService
      .sendReward({ supplier, amount: rewardAmount, rewardId: rewardId.toString() })
      .then((result) => {
        logger.info('Reward payment sent', {
          rewardId: rewardId.toString(),
          txHash: result.txHash,
        });
        hooks.onPaymentSettled?.(rewardId, { txHash: result.txHash });
      })
      .catch((error: unknown) => {
        logger.error('Reward payment failed', { rewardId: rewardId.toString(), error });
        hooks.onPaymentSettled?.(rewardId, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  });

  return () => {
    stopAttestationWatcher();
    stopRewardEligibleWatcher();
  };
}
