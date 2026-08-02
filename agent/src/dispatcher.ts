import { rewardDispatcherAbi } from '@provenance-streams/protocol';
import type { Address, Hex } from 'viem';
import { BaseError, ContractFunctionRevertedError } from 'viem';

import type { RewardEligibleEventArgs } from '@provenance-streams/protocol';

import { createAgentPublicClient, createAgentWalletClient } from './chainClient.js';
import type { ChainConfig, StopWatcher } from './chainClient.js';

export interface DispatcherConfig extends ChainConfig {
  rewardDispatcherAddress: Address;
  operatorPrivateKey: Hex;
}

export type RewardEligibleHandler = (args: RewardEligibleEventArgs) => void;

export type DispatchResult =
  | { status: 'dispatched'; txHash: Hex; rewardId: bigint }
  | { status: 'already-dispatched' }
  | { status: 'policy-not-enabled' }
  | { status: 'error'; error: unknown };

function revertedErrorName(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) {
    return undefined;
  }
  const revertError = error.walk((err) => err instanceof ContractFunctionRevertedError);
  return revertError instanceof ContractFunctionRevertedError
    ? revertError.data?.errorName
    : undefined;
}

/**
 * Calls `RewardDispatcher.dispatchReward` for `attestationId` using the agent's
 * operator wallet. `AlreadyDispatched` and `PolicyNotEnabled` are expected,
 * non-exceptional outcomes (e.g. a duplicate event replay after a restart) and
 * are reported as typed results rather than thrown.
 *
 * `onRewardIdKnown`, if given, fires as soon as the simulated `rewardId` is
 * known — before the transaction is even broadcast. This is deliberately
 * earlier than the return value: it lets a caller record the
 * attestationId↔rewardId link before `RewardEligible` can possibly be
 * observed by a separate watcher, closing what would otherwise be a race
 * between this function resolving and that watcher's own polling.
 */
export async function dispatchRewardOnChain(
  config: DispatcherConfig,
  attestationId: bigint,
  onRewardIdKnown?: (rewardId: bigint) => void,
): Promise<DispatchResult> {
  const publicClient = createAgentPublicClient(config);
  const walletClient = createAgentWalletClient({
    ...config,
    privateKey: config.operatorPrivateKey,
  });

  try {
    const { request, result } = await publicClient.simulateContract({
      address: config.rewardDispatcherAddress,
      abi: rewardDispatcherAbi,
      functionName: 'dispatchReward',
      args: [attestationId],
      account: walletClient.account,
    });

    onRewardIdKnown?.(result);

    const txHash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    return { status: 'dispatched', txHash, rewardId: result };
  } catch (error) {
    const errorName = revertedErrorName(error);
    if (errorName === 'AlreadyDispatched') {
      return { status: 'already-dispatched' };
    }
    if (errorName === 'PolicyNotEnabled') {
      return { status: 'policy-not-enabled' };
    }
    return { status: 'error', error };
  }
}

/**
 * Subscribes to `RewardEligible` events emitted by `RewardDispatcher` and invokes
 * `onRewardEligible` for each one.
 */
export function watchRewardEligible(
  config: DispatcherConfig,
  onRewardEligible: RewardEligibleHandler,
): StopWatcher {
  const client = createAgentPublicClient(config);

  return client.watchContractEvent({
    address: config.rewardDispatcherAddress,
    abi: rewardDispatcherAbi,
    eventName: 'RewardEligible',
    onLogs: (logs) => {
      for (const log of logs) {
        onRewardEligible(log.args);
      }
    },
  });
}
