import type { Address, Hex } from 'viem';

import type {
  AttestationSubmittedEventArgs,
  RewardEligibleEventArgs,
} from '@provenance-streams/protocol';

import { type AgentConfigInput, parseAgentConfig } from './config.js';
import { dispatchRewardOnChain, watchRewardEligible } from './dispatcher.js';
import { createLogger } from './logger.js';
import { evaluateReward } from './rewardEngine.js';
import { createBridgeService } from './services/bridgeService.js';
import type { FraudCheckResult } from './services/fraudService.js';
import { FraudService } from './services/fraudService.js';
import type { JobState } from './services/settlementQueue.js';
import { SettlementQueue } from './services/settlementQueue.js';
import { createTreasuryService } from './services/treasuryService.js';
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
} from './services/treasuryService.js';
export { createTreasuryService } from './services/treasuryService.js';
export type { BridgeInput, BridgeResult } from './services/bridgeService.js';
export { BridgeService, createBridgeService } from './services/bridgeService.js';
export type { FraudCheckInput, FraudCheckResult, FraudSignal } from './services/fraudService.js';
export { FraudService } from './services/fraudService.js';
export type { JobState, SettlementJob } from './services/settlementQueue.js';
export { SettlementQueue } from './services/settlementQueue.js';
export type {
  DestinationWalletInput,
  DestinationWalletValidation,
  SupportedDestinationChain,
} from './wallet/destinationWallet.js';
export {
  SUPPORTED_DESTINATION_CHAINS,
  validateDestinationWallet,
} from './wallet/destinationWallet.js';
export type { StopWatcher } from './chainClient.js';
export type { AttestationSubmittedHandler } from './watcher.js';
export type { RewardEligibleHandler } from './dispatcher.js';

const logger = createLogger('agent');

/** Outcome of a settlement payment, reported to `RunAgentHooks.onPaymentSettled`. */
export type PaymentSettlement =
  | {
      txHash: Hex;
      bridged?: boolean | undefined;
      destinationChain?: string | undefined;
      explorerUrl?: string | undefined;
    }
  | { error: string };

export interface RewardEligibleContext {
  /** The attestation id that produced this reward, when dispatched by this agent instance. */
  attestationId: bigint | undefined;
}

export interface DestinationWalletLookup {
  chain: string;
  address: Address;
}

export interface RunAgentHooks {
  /** Called whenever an `AttestationSubmitted` event is observed. */
  onAttestation?: (attestation: AttestationSubmittedEventArgs) => void;
  /** Called whenever a `RewardEligible` event is observed. */
  onRewardEligible?: (reward: RewardEligibleEventArgs, context: RewardEligibleContext) => void;
  /** Called once the settlement payment for `rewardId` finishes, one way or another. */
  onPaymentSettled?: (rewardId: bigint, settlement: PaymentSettlement) => void;
  /**
   * Called when a payout's fraud score crosses the configured threshold — it is
   * held for admin review instead of being settled automatically. The host
   * (`apps/backend`) is responsible for surfacing this and, if approved,
   * re-dispatching the payout itself.
   */
  onFraudFlagged?: (rewardId: bigint, result: FraudCheckResult) => void;
  /** Mirrors `SettlementQueue`'s job lifecycle, for the Admin dashboard's settlement queue view. */
  onQueueStateChange?: (
    rewardId: string,
    state: JobState,
    extra?: { attempt?: number; error?: unknown },
  ) => void;
  /**
   * The agent asks the host whether `supplier` has registered a destination
   * wallet for cross-chain settlement (`apps/backend`'s `/api/destination-wallet`
   * data). Returning `undefined` keeps the existing same-chain payout path.
   */
  getDestinationWallet?: (supplier: Address) => Promise<DestinationWalletLookup | undefined>;
}

export type StopAgent = () => void;

export interface ApprovePayoutInput {
  rewardId: bigint;
  supplier: Address;
  rewardAmount: bigint;
}

export interface AgentControl {
  /** Stops both event watchers. */
  stop: StopAgent;
  /**
   * Manually settles a payout that was held for fraud review
   * (`onFraudFlagged`), once an admin approves it from the dashboard. Runs
   * the exact same settlement path `RewardEligible` would have triggered
   * automatically — same-chain treasury payment, or a cross-chain bridge if
   * the supplier has a registered destination wallet — just skipping the
   * fraud check itself, since a human already reviewed it.
   */
  approvePayout: (input: ApprovePayoutInput) => void;
}

/**
 * Starts the autonomous settlement agent:
 *
 * 1. Watches `AttestationSubmitted` on `AttestationRegistry`, evaluates the
 *    reward rule, and — if eligible — calls `RewardDispatcher.dispatchReward`
 *    on-chain using the agent's operator wallet.
 * 2. Watches `RewardEligible` on `RewardDispatcher`, runs a fraud check, and —
 *    unless flagged — enqueues the settlement onto a single-worker retrying
 *    queue. Each job pays the supplier directly on Arc (`TreasuryService`) or,
 *    if the supplier registered a destination wallet, bridges canonical USDC
 *    to it cross-chain via Arc App Kit / Circle CCTP (`BridgeService`).
 *
 * `hooks` let the host process (e.g. `apps/backend`) track attestations,
 * payments, fraud flags, and queue state — e.g. to serve them over HTTP —
 * without the agent itself knowing anything about persistence or transport.
 */
export function runAgent(configInput: AgentConfigInput, hooks: RunAgentHooks = {}): AgentControl {
  const config = parseAgentConfig(configInput);
  const treasuryService = createTreasuryService(config, config.treasury);
  const bridgeServicePromise = createBridgeService(config.treasury, treasuryService);
  const fraudService = new FraudService(
    config.fraudScoreThreshold !== undefined ? { scoreThreshold: config.fraudScoreThreshold } : {},
  );
  const settlementQueue = new SettlementQueue(
    {},
    {
      onStateChange: (rewardId, state, extra) => {
        hooks.onQueueStateChange?.(rewardId, state, extra);
        if (state === 'failed') {
          hooks.onPaymentSettled?.(BigInt(rewardId), {
            error: extra?.error instanceof Error ? extra.error.message : String(extra?.error),
          });
        }
      },
    },
  );

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

  /**
   * Enqueues the actual settlement (same-chain treasury payment, or a
   * cross-chain bridge if the supplier registered a destination wallet) onto
   * the single-worker retrying queue. Shared by the automatic `RewardEligible`
   * path and `approvePayout` (manual settlement of a previously fraud-flagged
   * payout) so both go through identical logic.
   */
  function enqueueSettlement(rewardId: bigint, supplier: Address, rewardAmount: bigint): void {
    settlementQueue.enqueue({
      id: rewardId.toString(),
      execute: async () => {
        const destination = await hooks.getDestinationWallet?.(supplier);

        if (destination) {
          const bridgeService = await bridgeServicePromise;
          const result = await bridgeService.bridgeToDestination({
            amount: rewardAmount,
            recipientAddress: destination.address,
          });
          if (result.status === 'failed') {
            throw new Error(result.error);
          }
          logger.info('Reward bridged to destination chain', {
            rewardId: rewardId.toString(),
            destinationChain: destination.chain,
            destinationTxHash: result.destinationTxHash,
          });
          fraudService.recordPayout(supplier);
          hooks.onPaymentSettled?.(rewardId, {
            txHash: result.destinationTxHash ?? '0x0',
            bridged: true,
            destinationChain: destination.chain,
            explorerUrl: result.explorerUrl,
          });
          return;
        }

        const result = await treasuryService.sendReward({
          supplier,
          amount: rewardAmount,
          rewardId: rewardId.toString(),
        });
        logger.info('Reward payment sent', { rewardId: rewardId.toString(), txHash: result.txHash });
        fraudService.recordPayout(supplier);
        hooks.onPaymentSettled?.(rewardId, { txHash: result.txHash });
      },
    });
  }

  const stopRewardEligibleWatcher = watchRewardEligible(config, (reward) => {
    logger.info('Reward eligible', {
      rewardId: reward.rewardId?.toString(),
      supplier: reward.supplier,
      policyId: reward.policyId?.toString(),
      rewardAmount: reward.rewardAmount?.toString(),
    });
    const { rewardId, supplier, policyId, rewardAmount } = reward;
    const attestationId =
      rewardId === undefined ? undefined : attestationIdByRewardId.get(rewardId.toString());
    hooks.onRewardEligible?.(reward, { attestationId });

    if (rewardId === undefined || supplier === undefined || rewardAmount === undefined) {
      logger.error('RewardEligible event is missing required fields; cannot settle payment.');
      return;
    }

    const fraudResult = fraudService.check({
      attestationId: attestationId ?? 0n,
      supplier,
      policyId: policyId ?? 0n,
      rewardAmount,
    });
    if (fraudResult.flagged) {
      logger.warn('Payout flagged for review', {
        rewardId: rewardId.toString(),
        score: fraudResult.score,
        signals: fraudResult.signals.map((signal) => signal.reason),
      });
      hooks.onFraudFlagged?.(rewardId, fraudResult);
      return;
    }

    enqueueSettlement(rewardId, supplier, rewardAmount);
  });

  return {
    stop: () => {
      stopAttestationWatcher();
      stopRewardEligibleWatcher();
    },
    approvePayout: ({ rewardId, supplier, rewardAmount }) => {
      logger.info('Payout manually approved after fraud review', { rewardId: rewardId.toString() });
      enqueueSettlement(rewardId, supplier, rewardAmount);
    },
  };
}
