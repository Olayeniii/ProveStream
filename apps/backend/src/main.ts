import { createTreasuryService, parseAgentConfig, runAgent } from '@provenance-streams/agent';
import type { Address, Hex } from 'viem';

import { loadServerConfig } from './env.js';
import { createAttestationReader } from './services/attestationReader.js';
import { HistoryService } from './services/historyService.js';
import { PolicyService } from './services/policyService.js';
import {
  GeminiProvider,
  NvidiaProvider,
  RiskAnalysisService,
} from './services/riskAnalysisService.js';
import type { RiskAnalysisProvider, RiskAnalysisResult } from './services/riskAnalysisService.js';
import { SignatureVerificationService } from './services/signatureVerificationService.js';
import { loadSnapshot, saveSnapshot } from './services/snapshotStore.js';
import { WalletService } from './services/walletService.js';
import { createServer } from './server.js';
import { Store } from './store.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file present; fall back to whatever is already in process.env.
}

/** One past a persisted cursor, or `fallback` (usually the contract's deployment block) if there isn't one yet. */
function resumeFrom(cursor: string | undefined, fallback: bigint): bigint {
  return cursor !== undefined ? BigInt(cursor) + 1n : fallback;
}

async function main(): Promise<void> {
  const config = loadServerConfig();
  const agentConfig = parseAgentConfig(config.agentConfig);
  const snapshot = loadSnapshot();

  const store = new Store();
  if (snapshot) {
    store.restore(snapshot);
  }

  const treasuryService = createTreasuryService(
    { rpcUrl: config.rpcUrl, chainId: config.chainId },
    agentConfig.treasury,
  );
  store.setTreasuryMode(agentConfig.treasury.mode);
  const policyService = new PolicyService({
    rpcUrl: config.rpcUrl,
    rewardPolicyAddress: config.rewardPolicyAddress,
    fromBlock: resumeFrom(
      snapshot?.scannedThroughBlock.rewardPolicy,
      config.rewardPolicyDeployedAtBlock,
    ),
    knownIds: snapshot?.knownPolicyIds,
  });
  const walletService: WalletService | undefined = config.embeddedWallet
    ? new WalletService({
        apiKey: config.embeddedWallet.apiKey,
        appId: config.embeddedWallet.appId,
      })
    : undefined;
  // Ordered fallback chain: Gemini first (if configured), then two
  // NVIDIA-hosted models — each an independent, optional provider. A
  // quota-exhausted or otherwise-down provider just falls through to the
  // next instead of taking risk analysis offline entirely.
  const riskProviders: RiskAnalysisProvider[] = [];
  if (config.gemini) {
    riskProviders.push(
      new GeminiProvider({ apiKey: config.gemini.apiKey, model: config.gemini.model }),
    );
  }
  if (config.nvidia) {
    riskProviders.push(
      new NvidiaProvider('Llama 3.1 70B (NVIDIA)', {
        apiKey: config.nvidia.apiKey,
        model: config.nvidia.deepseekModel,
      }),
    );
    riskProviders.push(
      new NvidiaProvider('Llama 3.3 70B (NVIDIA)', {
        apiKey: config.nvidia.apiKey,
        model: config.nvidia.mistralModel,
      }),
    );
  }
  const riskAnalysisService: RiskAnalysisService | undefined =
    riskProviders.length > 0 ? new RiskAnalysisService(riskProviders) : undefined;
  const attestationReader = createAttestationReader({
    rpcUrl: config.rpcUrl,
    attestationRegistryAddress: config.attestationRegistryAddress,
  });
  const signatureVerificationService = new SignatureVerificationService({ rpcUrl: config.rpcUrl });

  /**
   * Independently verifies who signed `transactionHash` and records whether
   * it matches `auditor` — shared by the live `onAttestation` hook, the
   * history backfill, and the "fill in what a restored snapshot doesn't
   * have" pass below, so all three go through identical logic.
   */
  function verifyAttestationSignature(
    attestationId: string,
    transactionHash: Hex,
    auditor: Address,
  ): void {
    store.createPendingSignatureVerification(attestationId);
    signatureVerificationService
      .verifySignature(transactionHash)
      .then(({ signerAddress }) => {
        store.updateSignatureVerificationStatus(attestationId, 'complete', {
          signerAddress,
          verified: signerAddress.toLowerCase() === auditor.toLowerCase(),
        });
      })
      .catch((error: unknown) => {
        store.updateSignatureVerificationStatus(attestationId, 'failed', {
          error: error instanceof Error ? error.message : 'Signature verification failed.',
        });
      });
  }

  // Populate the Store from chain history before starting the live watchers
  // below, so a backend restart doesn't lose everything it already observed.
  // Deliberately read-only — see `HistoryService`'s docstring for why it
  // must never re-enter the fraud/settlement pipeline — and awaited here
  // (not fire-and-forget) so its block-number snapshot is guaranteed to
  // predate `runAgent`'s live subscriptions below, closing the only
  // realistic window where the two could otherwise observe the same event
  // twice. Resumes from the persisted snapshot's cursor when there is one,
  // so only a fresh install ever pays for the full historical scan.
  const historyService = new HistoryService({
    rpcUrl: config.rpcUrl,
    attestationRegistryAddress: config.attestationRegistryAddress,
    rewardDispatcherAddress: config.rewardDispatcherAddress,
    attestationRegistryFromBlock: resumeFrom(
      snapshot?.scannedThroughBlock.attestationRegistry,
      config.attestationRegistryDeployedAtBlock,
    ),
    rewardDispatcherFromBlock: resumeFrom(
      snapshot?.scannedThroughBlock.rewardDispatcher,
      config.rewardDispatcherDeployedAtBlock,
    ),
  });
  // Sequential, not Promise.all: both scans funnel through the same shared
  // RPC pacer (`rpcRetry.ts`) regardless, so running them one after another
  // instead of concurrently doesn't cost real time — it just keeps the
  // startup log readable and avoids two chunk loops interleaving their
  // requests through the gate at once.
  const attestationBackfill = await historyService
    .listHistoricalAttestations()
    .catch((error: unknown) => {
      console.error('Failed to backfill attestation history:', error);
      return {
        attestations: [],
        scannedThroughBlock: config.attestationRegistryDeployedAtBlock - 1n,
      };
    });
  const rewardBackfill = await historyService.listHistoricalRewards().catch((error: unknown) => {
    console.error('Failed to backfill reward history:', error);
    return { rewards: [], scannedThroughBlock: config.rewardDispatcherDeployedAtBlock - 1n };
  });
  for (const attestation of attestationBackfill.attestations) {
    store.addAttestation(attestation);
    // Unlike risk analysis, signature verification needs nothing that isn't
    // already on-chain — it can be (and is) redone for backfilled history too.
    verifyAttestationSignature(attestation.id, attestation.transactionHash, attestation.auditor);
  }

  // A restored snapshot's attestations (see `store.restore` above) don't carry
  // a signature-verification result — that was never persisted, since it's
  // cheaply re-derivable — so fill those in too. Attestations the backfill
  // loop just handled already have a pending/complete record and are skipped.
  for (const attestation of store.listAttestations()) {
    if (!store.getSignatureVerification(attestation.id)) {
      verifyAttestationSignature(attestation.id, attestation.transactionHash, attestation.auditor);
    }
  }
  for (const reward of rewardBackfill.rewards) {
    store.createPendingPayment({
      rewardId: reward.rewardId,
      attestationId: reward.attestationId ?? 'unknown',
      supplier: reward.supplier,
      policyId: reward.policyId,
      rewardAmount: reward.rewardAmount,
    });
  }
  console.log(
    `Backfilled ${attestationBackfill.attestations.length.toString()} attestation(s) and ${rewardBackfill.rewards.length.toString()} reward(s) from chain history (scanned through block ${attestationBackfill.scannedThroughBlock.toString()} / ${rewardBackfill.scannedThroughBlock.toString()}).`,
  );

  /**
   * Flushes everything worth surviving a restart to disk: the Store's read
   * models, `PolicyService`'s incremental scan progress (which advances on
   * every `/api/policies` call, not just here), and the two history-scan
   * cursors from this run's backfill. Called after the initial backfill,
   * then periodically, and on shutdown — not on every single mutation,
   * since a demo-scale event volume doesn't need that and periodic flushing
   * keeps disk writes cheap.
   */
  const persistSnapshot = () => {
    const policyProgress = policyService.getScanProgress();
    saveSnapshot({
      ...store.toSnapshotData(),
      knownPolicyIds: policyProgress.knownIds,
      scannedThroughBlock: {
        attestationRegistry: attestationBackfill.scannedThroughBlock.toString(),
        rewardDispatcher: rewardBackfill.scannedThroughBlock.toString(),
        rewardPolicy: policyProgress.scannedThroughBlock,
      },
    });
  };
  persistSnapshot();
  const persistInterval = setInterval(persistSnapshot, 20_000);

  /**
   * Tracks each attestation's risk-analysis outcome (resolving to `undefined`
   * on failure/no-evidence/not-configured, never rejecting) so
   * `shouldHoldForReview` below can await the *same* in-flight call instead
   * of re-triggering one, and so it has something to check at all — an
   * attestation's `RewardEligible` can fire before its risk analysis
   * finishes, since the two run on independent timelines.
   */
  const riskAnalysisPromises = new Map<string, Promise<RiskAnalysisResult | undefined>>();
  const RISK_HOLD_WAIT_MS = 20_000;

  const agentControl = runAgent(config.agentConfig, {
    onAttestation: (attestation, context) => {
      if (
        attestation.id === undefined ||
        attestation.supplier === undefined ||
        attestation.auditor === undefined
      ) {
        return;
      }
      const attestationId = attestation.id.toString();
      const auditor = attestation.auditor;
      store.addAttestation({
        id: attestationId,
        supplier: attestation.supplier,
        auditor,
        policyId: (attestation.policyId ?? 0n).toString(),
        observedAt: new Date().toISOString(),
        transactionHash: context.transactionHash,
      });

      verifyAttestationSignature(attestationId, context.transactionHash, auditor);

      // Always resolve the proof hash and mark any matching evidence
      // submission attested, independent of whether risk analysis is
      // configured — those are two different consumers of the same lookup.
      const attestationIdValue = attestation.id;
      const proofHashPromise = attestationReader
        .getProofHash(attestationIdValue)
        .catch((error: unknown) => {
          console.error('Failed to read proof hash for attestation:', error);
          return undefined;
        });

      if (!riskAnalysisService) {
        void proofHashPromise.then((proofHash) => {
          if (proofHash) {
            store.markEvidenceAttested(proofHash, attestationId);
          }
        });
        return;
      }
      const riskAnalysisPromise: Promise<RiskAnalysisResult | undefined> = proofHashPromise.then(
        (proofHash) => {
          if (!proofHash) {
            return undefined;
          }
          store.markEvidenceAttested(proofHash, attestationId);
          const evidenceText = store.getEvidenceSubmission(proofHash)?.evidenceText;
          if (!evidenceText) {
            return undefined;
          }
          store.createPendingRiskAnalysis(attestationId);
          return riskAnalysisService
            .analyzeEvidence({ evidenceText, policyId: (attestation.policyId ?? 0n).toString() })
            .then((result) => {
              store.updateRiskAnalysisStatus(attestationId, 'complete', result);
              return result;
            })
            .catch((error: unknown) => {
              // Each provider's raw error (status codes, quota details, model ids) is
              // already logged as it happens inside RiskAnalysisService — what reaches
              // the store/UI here must stay a clean, model-agnostic message; never the
              // raw multi-provider dump `error` carries.
              console.error('Risk analysis unavailable for attestation', attestationId, error);
              store.updateRiskAnalysisStatus(attestationId, 'failed', {
                error: 'AI risk analysis is temporarily unavailable.',
              });
              return undefined;
            });
        },
      );
      riskAnalysisPromises.set(attestationId, riskAnalysisPromise);
    },
    onRewardEligible: (reward, context) => {
      if (reward.rewardId === undefined || reward.supplier === undefined) {
        return;
      }
      store.createPendingPayment({
        rewardId: reward.rewardId.toString(),
        attestationId: context.attestationId?.toString() ?? 'unknown',
        supplier: reward.supplier,
        policyId: (reward.policyId ?? 0n).toString(),
        rewardAmount: (reward.rewardAmount ?? 0n).toString(),
      });
    },
    onPaymentSettled: (rewardId, settlement) => {
      if ('txHash' in settlement) {
        store.updatePaymentStatus(rewardId.toString(), 'complete', {
          txHash: settlement.txHash,
          bridged: settlement.bridged,
          destinationChain: settlement.destinationChain,
        });
      } else {
        store.updatePaymentStatus(rewardId.toString(), 'failed', { error: settlement.error });
      }
    },
    onFraudFlagged: (rewardId, result) => {
      const payment = store.listPayments().find((entry) => entry.rewardId === rewardId.toString());
      if (!payment) {
        return;
      }
      store.createFraudAlert({
        rewardId: rewardId.toString(),
        attestationId: payment.attestationId,
        supplier: payment.supplier,
        policyId: payment.policyId,
        rewardAmount: payment.rewardAmount,
        score: result.score,
        reasons: result.signals.map((signal) => signal.reason),
      });
    },
    shouldHoldForReview: async (rewardId, context) => {
      const attestationId = context.attestationId?.toString();
      const pending = attestationId ? riskAnalysisPromises.get(attestationId) : undefined;
      if (!pending) {
        // No risk analysis was ever attempted for this attestation (no
        // evidence submitted, or the feature isn't configured) — nothing to
        // gate on, so don't hold.
        return false;
      }

      const result = await Promise.race([
        pending,
        new Promise<undefined>((resolve) =>
          setTimeout(() => resolve(undefined), RISK_HOLD_WAIT_MS),
        ),
      ]);
      if (!result || result.score < (agentConfig.fraudScoreThreshold ?? 70)) {
        return false;
      }

      const payment = store.listPayments().find((entry) => entry.rewardId === rewardId.toString());
      if (!payment) {
        return false;
      }
      store.createFraudAlert({
        rewardId: rewardId.toString(),
        attestationId: payment.attestationId,
        supplier: payment.supplier,
        policyId: payment.policyId,
        rewardAmount: payment.rewardAmount,
        score: result.score,
        reasons: [`AI risk analysis (${result.provider}): ${result.summary}`],
      });
      return true;
    },
    onQueueStateChange: (rewardId, state, extra) => {
      store.updateSettlementJobState(rewardId, state, {
        attempt: extra?.attempt,
        error: extra?.error instanceof Error ? extra.error.message : extra?.error?.toString(),
      });
    },
    getDestinationWallet: (supplier) => {
      const record = store.getDestinationWallet(supplier);
      return Promise.resolve(
        record
          ? { chain: record.chain, address: record.address, x402ClaimUrl: record.x402ClaimUrl }
          : undefined,
      );
    },
  });

  const app = createServer({
    corsOrigin: config.corsOrigin,
    store,
    treasuryService,
    policyService,
    walletService,
    attestationRegistryAddress: config.attestationRegistryAddress,
    defaultWalletBlockchain: config.circle?.treasuryBlockchain ?? 'ARC-TESTNET',
    agentControl,
  });

  const server = app.listen(config.port, () => {
    console.log(`Backend API listening on http://localhost:${config.port.toString()}`);
    if (!config.embeddedWallet) {
      console.log(
        'Embedded wallets are disabled: set CIRCLE_API_KEY / CIRCLE_APP_ID to enable them.',
      );
    }
  });

  const shutdown = () => {
    clearInterval(persistInterval);
    persistSnapshot();
    agentControl.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('Failed to start backend: invalid configuration.\n', error);
  process.exitCode = 1;
});
