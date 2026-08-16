import { createTreasuryService, parseAgentConfig, runAgent } from '@provenance-streams/agent';
import { createLogger } from '@provenance-streams/logger';
import type { EvidenceSubmission } from '@provenance-streams/protocol';
import type { Address, Hex } from 'viem';

import { createChainScanProgressRepo } from './db/repositories/chainScanProgressRepo.js';
import { createSessionsRepo } from './db/repositories/sessionsRepo.js';
import { createUsersRepo } from './db/repositories/usersRepo.js';
import { runMigrations } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { loadServerConfig } from './env.js';
import { createAttestationReader } from './services/attestationReader.js';
import { CircleWebhookService } from './services/circleWebhookService.js';
import { DecisionAnchorService } from './services/decisionAnchorService.js';
import { HistoryService } from './services/historyService.js';
import { PolicyService } from './services/policyService.js';
import {
  GeminiProvider,
  NvidiaProvider,
  RiskAnalysisService,
} from './services/riskAnalysisService.js';
import type { RiskAnalysisProvider, RiskAnalysisResult } from './services/riskAnalysisService.js';
import { SignatureVerificationService } from './services/signatureVerificationService.js';
import { WalletService } from './services/walletService.js';
import { createServer } from './server.js';
import { Store } from './store.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file present; fall back to whatever is already in process.env.
}

const logger = createLogger('main');

/** One past a persisted cursor, or `fallback` (usually the contract's deployment block) if there isn't one yet. */
function resumeFrom(cursor: string | undefined, fallback: bigint): bigint {
  return cursor !== undefined ? BigInt(cursor) + 1n : fallback;
}

async function main(): Promise<void> {
  const config = loadServerConfig();
  const agentConfig = parseAgentConfig(config.agentConfig);

  const pool = createPool(config.databaseUrl);
  await runMigrations(pool);
  const chainScanProgress = createChainScanProgressRepo(pool);
  const usersRepo = createUsersRepo(pool);
  const sessionsRepo = createSessionsRepo(pool);

  const store = new Store(pool);

  const treasuryService = createTreasuryService(
    { rpcUrl: config.rpcUrl, chainId: config.chainId },
    agentConfig.treasury,
  );
  store.setTreasuryMode(agentConfig.treasury.mode);

  const policyScanProgress = await chainScanProgress.get<{
    knownIds: string[];
    scannedThroughBlock: string;
  }>('policyService');
  const policyService = new PolicyService({
    rpcUrl: config.rpcUrl,
    rewardPolicyAddress: config.rewardPolicyAddress,
    fromBlock: resumeFrom(
      policyScanProgress?.scannedThroughBlock,
      config.rewardPolicyDeployedAtBlock,
    ),
    knownIds: policyScanProgress?.knownIds,
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
   * history backfill, and the "fill in what a fresh in-memory map doesn't
   * have yet" pass below, so all three go through identical logic.
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

  /**
   * Runs risk analysis for `attestationId` given real evidence text, and
   * records the result. Shared by the live `onAttestation` hook and
   * `tryAnalyzeRiskForNewEvidence` (evidence submitted *after* its matching
   * attestation already happened) so both go through identical logic.
   */
  async function runRiskAnalysis(
    attestationId: string,
    evidenceText: string,
    policyId: string,
  ): Promise<RiskAnalysisResult | undefined> {
    if (!riskAnalysisService) {
      return undefined;
    }
    await store.createPendingRiskAnalysis(attestationId);
    try {
      const result = await riskAnalysisService.analyzeEvidence({ evidenceText, policyId });
      await store.updateRiskAnalysisStatus(attestationId, 'complete', result);
      return result;
    } catch (error) {
      // Each provider's raw error (status codes, quota details, model ids) is
      // already logged as it happens inside RiskAnalysisService — what reaches
      // the store/UI here must stay a clean, model-agnostic message; never the
      // raw multi-provider dump `error` carries.
      logger.error('Risk analysis unavailable for attestation', { attestationId, error });
      await store.updateRiskAnalysisStatus(attestationId, 'failed', {
        error: 'AI risk analysis is temporarily unavailable.',
      });
      return undefined;
    }
  }

  /** How far past the Store's known attestations to look, on-chain, for a proofHash match — see `tryAnalyzeRiskForNewEvidence`. */
  const FALLBACK_SCAN_MAX_ATTESTATION_ID = 100;

  /**
   * `onAttestation` only fires once, live, when an attestation's own event is
   * first observed — evidence submitted afterwards (a resubmission for
   * already-attested work, or a supplier who submits evidence post-hoc) never
   * gets picked up by it, and risk analysis can't be backfilled from chain
   * history alone (evidence text isn't on-chain, only its hash is — see the
   * history-backfill loop below). This bridges that gap: finds an attestation
   * whose on-chain proofHash matches this evidence, and — if it hasn't been
   * analyzed yet — runs it now.
   *
   * Checks the Store's already-known attestations first (free, no chain
   * calls). If nothing matches there, falls back to directly probing
   * attestation ids the Store hasn't backfilled yet — the historical backfill
   * is incremental and can lag far behind the chain tip for a long time under
   * RPC rate limiting (`eth_getLogs` is what actually gets rate-limited; each
   * fallback check here is one cheap `eth_call` instead). A proofHash match on
   * any id is unambiguous — `AttestationRegistry` enforces global proofHash
   * uniqueness on-chain, so no supplier/policy check is needed to confirm it.
   */
  async function tryAnalyzeRiskForNewEvidence(submission: EvidenceSubmission): Promise<void> {
    if (!riskAnalysisService) {
      return;
    }
    const attestations = await store.listAttestations();
    const knownIds = new Set(attestations.map((attestation) => attestation.id));
    const matchingAttestations = attestations.filter(
      (attestation) =>
        attestation.supplier.toLowerCase() === submission.supplier.toLowerCase() &&
        attestation.policyId === submission.policyId,
    );
    const alreadyAnalyzed = await Promise.all(
      matchingAttestations.map((attestation) => store.getRiskAnalysis(attestation.id)),
    );
    const candidateIds = matchingAttestations
      .filter((_attestation, index) => !alreadyAnalyzed[index])
      .map((attestation) => attestation.id);

    for (const id of candidateIds) {
      const proofHash = await attestationReader.getProofHash(BigInt(id)).catch(() => undefined);
      if (proofHash === submission.proofHash) {
        await store.markEvidenceAttested(submission.proofHash, id);
        await runRiskAnalysis(id, submission.evidenceText, submission.policyId);
        return;
      }
    }

    for (let id = 1; id <= FALLBACK_SCAN_MAX_ATTESTATION_ID; id++) {
      const idString = id.toString();
      if (knownIds.has(idString)) {
        continue;
      }
      const proofHash = await attestationReader.getProofHash(BigInt(id)).catch(() => undefined);
      if (proofHash === submission.proofHash) {
        await store.markEvidenceAttested(submission.proofHash, idString);
        await runRiskAnalysis(idString, submission.evidenceText, submission.policyId);
        return;
      }
    }
  }

  // Populate the Store from chain history before starting the live watchers
  // below, so a backend restart doesn't lose everything it already observed.
  // Deliberately read-only — see `HistoryService`'s docstring for why it
  // must never re-enter the fraud/settlement pipeline — and awaited here
  // (not fire-and-forget) so its block-number snapshot is guaranteed to
  // predate `runAgent`'s live subscriptions below, closing the only
  // realistic window where the two could otherwise observe the same event
  // twice. Resumes from the persisted cursor when there is one, so only a
  // fresh install ever pays for the full historical scan.
  const attestationCursor = await chainScanProgress.get<string>('attestationRegistry');
  const rewardCursor = await chainScanProgress.get<string>('rewardDispatcher');
  const historyService = new HistoryService({
    rpcUrl: config.rpcUrl,
    attestationRegistryAddress: config.attestationRegistryAddress,
    rewardDispatcherAddress: config.rewardDispatcherAddress,
    attestationRegistryFromBlock: resumeFrom(
      attestationCursor,
      config.attestationRegistryDeployedAtBlock,
    ),
    rewardDispatcherFromBlock: resumeFrom(rewardCursor, config.rewardDispatcherDeployedAtBlock),
  });
  // Sequential, not Promise.all: both scans funnel through the same shared
  // RPC pacer (`rpcRetry.ts`) regardless, so running them one after another
  // instead of concurrently doesn't cost real time — it just keeps the
  // startup log readable and avoids two chunk loops interleaving their
  // requests through the gate at once.
  const attestationBackfill = await historyService
    .listHistoricalAttestations()
    .catch((error: unknown) => {
      logger.error('Failed to backfill attestation history:', { error });
      return {
        attestations: [],
        scannedThroughBlock: config.attestationRegistryDeployedAtBlock - 1n,
      };
    });
  const rewardBackfill = await historyService.listHistoricalRewards().catch((error: unknown) => {
    logger.error('Failed to backfill reward history:', { error });
    return { rewards: [], scannedThroughBlock: config.rewardDispatcherDeployedAtBlock - 1n };
  });
  for (const attestation of attestationBackfill.attestations) {
    await store.addAttestation(attestation);
    // Unlike risk analysis, signature verification needs nothing that isn't
    // already on-chain — it can be (and is) redone for backfilled history too.
    verifyAttestationSignature(attestation.id, attestation.transactionHash, attestation.auditor);
  }

  // Signature verification lives only in an in-memory Map (cheap to
  // rederive, deliberately not persisted — see `Store`), so it starts empty
  // on every restart. The backfill loop just above only covers attestations
  // *this run's* chain scan found — which can lag far behind what's already
  // in Postgres from a prior run, especially under Arc testnet's rate
  // limiting — so fill in a verification for every already-known attestation
  // this run's backfill loop didn't just handle.
  for (const attestation of await store.listAttestations()) {
    if (!store.getSignatureVerification(attestation.id)) {
      verifyAttestationSignature(attestation.id, attestation.transactionHash, attestation.auditor);
    }
  }
  for (const reward of rewardBackfill.rewards) {
    await store.createPendingPayment({
      rewardId: reward.rewardId,
      attestationId: reward.attestationId ?? 'unknown',
      supplier: reward.supplier,
      policyId: reward.policyId,
      rewardAmount: reward.rewardAmount,
    });
  }
  logger.info(
    `Backfilled ${attestationBackfill.attestations.length.toString()} attestation(s) and ${rewardBackfill.rewards.length.toString()} reward(s) from chain history (scanned through block ${attestationBackfill.scannedThroughBlock.toString()} / ${rewardBackfill.scannedThroughBlock.toString()}).`,
  );

  // These two cursors are static for the rest of this run (HistoryService's
  // backfill is one-shot, at startup) — write once now rather than on an
  // interval.
  await chainScanProgress.set(
    'attestationRegistry',
    attestationBackfill.scannedThroughBlock.toString(),
  );
  await chainScanProgress.set('rewardDispatcher', rewardBackfill.scannedThroughBlock.toString());

  /**
   * `PolicyService`'s scan progress keeps advancing over the process's
   * lifetime (on every `/api/policies` call, not just at startup), unlike
   * the two history cursors above — so, unlike those, it needs periodic
   * persistence, not a one-shot write. Same 20s cadence as the old
   * whole-`Store` snapshot flush this replaces, plus once on shutdown.
   */
  const persistPolicyProgress = () => {
    void chainScanProgress
      .set('policyService', policyService.getScanProgress())
      .catch((error: unknown) =>
        logger.error('Failed to persist policy scan progress:', { error }),
      );
  };
  const persistInterval = setInterval(persistPolicyProgress, 20_000);

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
      void store
        .addAttestation({
          id: attestationId,
          supplier: attestation.supplier,
          auditor,
          policyId: (attestation.policyId ?? 0n).toString(),
          observedAt: new Date().toISOString(),
          transactionHash: context.transactionHash,
        })
        .catch((error: unknown) => logger.error('Failed to persist attestation:', { error }));

      verifyAttestationSignature(attestationId, context.transactionHash, auditor);

      // Always resolve the proof hash and mark any matching evidence
      // submission attested, independent of whether risk analysis is
      // configured — those are two different consumers of the same lookup.
      const attestationIdValue = attestation.id;
      const proofHashPromise = attestationReader
        .getProofHash(attestationIdValue)
        .catch((error: unknown) => {
          logger.error('Failed to read proof hash for attestation:', { error });
          return undefined;
        });

      if (!riskAnalysisService) {
        void proofHashPromise.then((proofHash) => {
          if (proofHash) {
            void store
              .markEvidenceAttested(proofHash, attestationId)
              .catch((error: unknown) =>
                logger.error('Failed to mark evidence attested:', { error }),
              );
          }
        });
        return;
      }
      const riskAnalysisPromise: Promise<RiskAnalysisResult | undefined> = proofHashPromise.then(
        async (proofHash) => {
          if (!proofHash) {
            return undefined;
          }
          await store.markEvidenceAttested(proofHash, attestationId);
          const evidenceText = (await store.getEvidenceSubmission(proofHash))?.evidenceText;
          if (!evidenceText) {
            return undefined;
          }
          return runRiskAnalysis(
            attestationId,
            evidenceText,
            (attestation.policyId ?? 0n).toString(),
          );
        },
      );
      riskAnalysisPromises.set(attestationId, riskAnalysisPromise);
    },
    onRewardEligible: (reward, context) => {
      if (reward.rewardId === undefined || reward.supplier === undefined) {
        return;
      }
      void store
        .createPendingPayment({
          rewardId: reward.rewardId.toString(),
          attestationId: context.attestationId?.toString() ?? 'unknown',
          supplier: reward.supplier,
          policyId: (reward.policyId ?? 0n).toString(),
          rewardAmount: (reward.rewardAmount ?? 0n).toString(),
        })
        .catch((error: unknown) => logger.error('Failed to persist pending payment:', { error }));
    },
    onPaymentSettled: (rewardId, settlement) => {
      const update =
        'txHash' in settlement
          ? store.updatePaymentStatus(rewardId.toString(), 'complete', {
              txHash: settlement.txHash,
              bridged: settlement.bridged,
              destinationChain: settlement.destinationChain,
            })
          : store.updatePaymentStatus(rewardId.toString(), 'failed', { error: settlement.error });
      void update.catch((error: unknown) =>
        logger.error('Failed to update payment status:', { error }),
      );
    },
    onFraudFlagged: (rewardId, result) => {
      void (async () => {
        const payments = await store.listPayments();
        const payment = payments.find((entry) => entry.rewardId === rewardId.toString());
        if (!payment) {
          return;
        }
        await store.createFraudAlert({
          rewardId: rewardId.toString(),
          attestationId: payment.attestationId,
          supplier: payment.supplier,
          policyId: payment.policyId,
          rewardAmount: payment.rewardAmount,
          score: result.score,
          reasons: result.signals.map((signal) => signal.reason),
        });
      })();
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

      const payments = await store.listPayments();
      const payment = payments.find((entry) => entry.rewardId === rewardId.toString());
      if (!payment) {
        return false;
      }
      await store.createFraudAlert({
        rewardId: rewardId.toString(),
        attestationId: payment.attestationId,
        supplier: payment.supplier,
        policyId: payment.policyId,
        rewardAmount: payment.rewardAmount,
        score: result.score,
        reasons: [`AI risk analysis: ${result.summary}`],
      });
      return true;
    },
    onQueueStateChange: (rewardId, state, extra) => {
      void store
        .updateSettlementJobState(rewardId, state, {
          attempt: extra?.attempt,
          error: extra?.error instanceof Error ? extra.error.message : extra?.error?.toString(),
        })
        .catch((error: unknown) =>
          logger.error('Failed to persist settlement job state:', { error }),
        );
    },
    getDestinationWallet: async (supplier) => {
      const record = await store.getDestinationWallet(supplier);
      return record
        ? { chain: record.chain, address: record.address, x402ClaimUrl: record.x402ClaimUrl }
        : undefined;
    },
  });

  const decisionAnchorService = new DecisionAnchorService({
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    decisionRegistryAddress: config.decisionRegistryAddress,
    // `AgentConfigInput` is the zod schema's pre-refine input type (plain
    // `string`); the same value is validated as a real hex private key by
    // `parseAgentConfig`/`runAgent` elsewhere on this exact field.
    operatorPrivateKey: config.agentConfig.operatorPrivateKey as Hex,
  });

  // Reuses the same Circle API key already required for embedded
  // wallets/treasury — Circle's webhook signature scheme needs it to fetch
  // the (cached, static-per-keyId) notification public key, not a separate
  // webhook-specific secret.
  const circleWebhookService = config.circle
    ? new CircleWebhookService(config.circle.apiKey)
    : undefined;

  const app = createServer({
    corsOrigin: config.corsOrigin,
    adminToken: config.adminToken,
    adminEmails: config.adminEmails,
    usersRepo,
    sessionsRepo,
    store,
    treasuryService,
    policyService,
    walletService,
    attestationRegistryAddress: config.attestationRegistryAddress,
    defaultWalletBlockchain: config.circle?.treasuryBlockchain ?? 'ARC-TESTNET',
    agentControl,
    decisionAnchorService,
    circleWebhookService,
    onEvidenceSubmitted: (submission) => {
      void tryAnalyzeRiskForNewEvidence(submission);
    },
  });

  const server = app.listen(config.port, () => {
    logger.info(`Backend API listening on port ${config.port.toString()}`);
    if (!config.embeddedWallet) {
      logger.info(
        'Embedded wallets are disabled: set CIRCLE_API_KEY / CIRCLE_APP_ID to enable them.',
      );
    }
  });

  const shutdown = () => {
    clearInterval(persistInterval);
    persistPolicyProgress();
    agentControl.stop();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  logger.error('Failed to start backend: invalid configuration.', { error });
  process.exitCode = 1;
});
