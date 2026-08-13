import { createAgentPublicClient, createAgentWalletClient } from '@provenance-streams/agent';
import type { ChainConfig } from '@provenance-streams/agent';
import type { FraudAlert } from '@provenance-streams/protocol';
import { decisionRegistryAbi } from '@provenance-streams/protocol';
import type { Address, Hex } from 'viem';
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  encodePacked,
  keccak256,
} from 'viem';

export type AnchorResult =
  | { status: 'anchored'; txHash: Hex }
  | { status: 'already-anchored' }
  | { status: 'error'; error: unknown };

/** `decisionType` tags for `DecisionRegistry.recordDecision` — extend as more decision kinds get anchored. */
export const DECISION_TYPE_FRAUD_RESOLUTION = 0;

/**
 * Deterministic `decisionId`/`contentHash` for a resolved fraud alert, via
 * viem's ABI encoding (not JSON, for on-chain-standard determinism). Anyone
 * can recompute this from a `FraudAlert` record to verify it against what's
 * anchored on-chain — same formula on both sides.
 *
 * `decisionId` is unique per `rewardId` because `server.ts`'s approve/reject
 * routes already enforce a fraud alert resolves exactly once (409 if it's
 * not still `'flagged'`).
 */
export function computeFraudResolutionAnchor(
  alert: Pick<
    FraudAlert,
    | 'rewardId'
    | 'attestationId'
    | 'supplier'
    | 'policyId'
    | 'rewardAmount'
    | 'score'
    | 'status'
    | 'updatedAt'
  >,
): { decisionId: Hex; contentHash: Hex } {
  const decisionId = keccak256(
    encodePacked(['string', 'uint256'], ['fraud-resolution', BigInt(alert.rewardId)]),
  );
  const contentHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'string' },
        { type: 'string' },
      ],
      [
        BigInt(alert.rewardId),
        BigInt(alert.attestationId),
        alert.supplier,
        BigInt(alert.policyId),
        BigInt(alert.rewardAmount),
        BigInt(alert.score),
        alert.status,
        alert.updatedAt,
      ],
    ),
  );
  return { decisionId, contentHash };
}

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
 * Anchors a content hash of an off-chain economic decision on `DecisionRegistry`,
 * making it tamper-evident. Reuses the agent's operator wallet (same signer
 * `dispatchRewardOnChain` uses for `RewardDispatcher`) and the exact same
 * simulate-then-write pattern — no new signer, no new conventions.
 */
export class DecisionAnchorService {
  constructor(
    private readonly config: ChainConfig & {
      decisionRegistryAddress: Address;
      operatorPrivateKey: Hex;
    },
  ) {}

  async anchorDecision(
    decisionId: Hex,
    contentHash: Hex,
    decisionType: number,
  ): Promise<AnchorResult> {
    const publicClient = createAgentPublicClient(this.config);
    const walletClient = createAgentWalletClient({
      ...this.config,
      privateKey: this.config.operatorPrivateKey,
    });

    try {
      const { request } = await publicClient.simulateContract({
        address: this.config.decisionRegistryAddress,
        abi: decisionRegistryAbi,
        functionName: 'recordDecision',
        args: [decisionId, contentHash, decisionType],
        account: walletClient.account,
      });

      const txHash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      return { status: 'anchored', txHash };
    } catch (error) {
      if (revertedErrorName(error) === 'DecisionAlreadyRecorded') {
        return { status: 'already-anchored' };
      }
      return { status: 'error', error };
    }
  }
}
