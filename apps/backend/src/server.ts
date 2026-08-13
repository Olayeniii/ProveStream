import type { AgentControl, TreasuryService } from '@provenance-streams/agent';
import { validateDestinationWallet } from '@provenance-streams/agent';
import type { EvidenceSubmission, EvidenceSubmissionStatus } from '@provenance-streams/protocol';
import { isAddress, isHex } from 'viem';
import cors from 'cors';
import express from 'express';
import type { Express, RequestHandler } from 'express';
import { z } from 'zod';

import {
  computeFraudResolutionAnchor,
  DECISION_TYPE_FRAUD_RESOLUTION,
} from './services/decisionAnchorService.js';
import type { DecisionAnchorService } from './services/decisionAnchorService.js';
import type { PolicyService } from './services/policyService.js';
import type { WalletService } from './services/walletService.js';
import type { Store } from './store.js';

export interface ServerDependencies {
  corsOrigin: string;
  store: Store;
  treasuryService: TreasuryService;
  policyService: PolicyService;
  walletService: WalletService | undefined;
  defaultWalletBlockchain: string;
  attestationRegistryAddress: string;
  agentControl: AgentControl;
  /** Anchors fraud-alert approve/reject decisions on-chain (see `anchorFraudResolution`). */
  decisionAnchorService: DecisionAnchorService;
  /**
   * A shared secret gating every admin route (see docs/decisions.md). Deliberately
   * a single token, not session/JWT machinery — the goal is closing a real,
   * exploitable hole (AdminDashboard had zero auth) by the deadline, not building
   * full RBAC. The long-term fix is identity-backed, tied to a real wallet session.
   */
  adminToken: string;
  /**
   * Called after a new evidence submission is persisted — lets the host retry
   * risk analysis for an already-attested proofHash match (see `main.ts`'s
   * `tryAnalyzeRiskForNewEvidence`), since `onAttestation` only ever fires once.
   */
  onEvidenceSubmitted?: (submission: EvidenceSubmission) => void;
}

function isEvidenceSubmissionStatus(value: unknown): value is EvidenceSubmissionStatus {
  return value === 'pending' || value === 'attested' || value === 'rejected';
}

/**
 * Anchors a resolved fraud alert's content hash on `DecisionRegistry`,
 * making the approve/reject decision tamper-evident instead of just an
 * overwritable status field. Fires asynchronously — the HTTP response
 * above doesn't wait on testnet confirmation latency; the frontend's
 * existing poll picks up the result via `FraudAlert.resolutionAnchor`.
 */
async function anchorFraudResolution(deps: ServerDependencies, rewardId: string): Promise<void> {
  const alert = await deps.store.getFraudAlert(rewardId);
  if (!alert) {
    return;
  }
  await deps.store.updateFraudAlertAnchor(rewardId, 'pending');
  const { decisionId, contentHash } = computeFraudResolutionAnchor(alert);
  try {
    const result = await deps.decisionAnchorService.anchorDecision(
      decisionId,
      contentHash,
      DECISION_TYPE_FRAUD_RESOLUTION,
    );
    if (result.status === 'anchored') {
      await deps.store.updateFraudAlertAnchor(rewardId, 'anchored', result.txHash);
    } else if (result.status === 'already-anchored') {
      await deps.store.updateFraudAlertAnchor(rewardId, 'anchored');
    } else {
      await deps.store.updateFraudAlertAnchor(rewardId, 'failed');
    }
  } catch {
    await deps.store.updateFraudAlertAnchor(rewardId, 'failed');
  }
}

const adminLoginBodySchema = z.object({ token: z.string().min(1) });

const createSessionBodySchema = z.object({ userId: z.string().min(1) });
const createWalletChallengeBodySchema = z.object({ userToken: z.string().min(1) });
const attestationChallengeBodySchema = z.object({
  userToken: z.string().min(1),
  walletId: z.string().min(1),
  supplier: z.string().refine(isAddress),
  proofHash: z.string().min(1),
  policyId: z.string().min(1),
});
const transferChallengeBodySchema = z.object({
  userToken: z.string().min(1),
  walletId: z.string().min(1),
  destinationAddress: z.string().refine(isAddress),
  amount: z.string().min(1),
});
const waitForTxHashBodySchema = z.object({ userToken: z.string().min(1) });
const evidenceSubmissionBodySchema = z.object({
  supplier: z.string().refine(isAddress),
  policyId: z.string().min(1),
  evidenceText: z.string().min(1),
});
const destinationWalletBodySchema = z.object({
  supplier: z.string().refine(isAddress),
  chain: z.string().min(1),
  address: z.string().min(1),
  x402ClaimUrl: z.string().url().optional(),
});

/** Builds the Express app exposing the dashboards' read APIs and the embedded wallet bootstrap. */
export function createServer(deps: ServerDependencies): Express {
  const app = express();
  app.use(cors({ origin: deps.corsOrigin }));
  app.use(express.json());

  /** Gates every admin route — reads too, not just the mutating ones, so the underlying data isn't public either. */
  const requireAdminToken: RequestHandler = (req, res, next) => {
    const submitted = req.header('X-Admin-Token');
    if (!submitted || submitted !== deps.adminToken) {
      res.status(401).json({ error: 'Missing or invalid admin token.' });
      return;
    }
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/admin/login', (req, res) => {
    const body = adminLoginBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'A token is required.' });
      return;
    }
    res.json({ ok: body.data.token === deps.adminToken });
  });

  app.get('/api/treasury', (_req, res, next) => {
    deps.treasuryService
      .getBalance()
      .then((balance) => res.json(balance))
      .catch(next);
  });

  app.get('/api/policies', (_req, res, next) => {
    deps.policyService
      .listPolicies()
      .then((policies) => res.json(policies))
      .catch(next);
  });

  app.post('/api/policies/:id/register', (req, res, next) => {
    let id: bigint;
    try {
      id = BigInt(req.params.id);
    } catch {
      res.status(400).json({ error: 'id must be a numeric policy id' });
      return;
    }

    deps.policyService
      .registerKnownPolicy(id)
      .then((policy) => res.json(policy))
      .catch(next);
  });

  app.get('/api/attestations', (_req, res, next) => {
    deps.store
      .listAttestations()
      .then((attestations) => res.json(attestations))
      .catch(next);
  });

  app.get('/api/payments', (_req, res, next) => {
    deps.store
      .listPayments()
      .then((payments) => res.json(payments))
      .catch(next);
  });

  app.post('/api/evidence-submissions', (req, res, next) => {
    const body = evidenceSubmissionBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'supplier, policyId, and evidenceText are required' });
      return;
    }

    deps.store
      .createEvidenceSubmission({
        supplier: body.data.supplier,
        policyId: body.data.policyId,
        evidenceText: body.data.evidenceText,
      })
      .then((record) => {
        deps.onEvidenceSubmitted?.(record);
        res.json(record);
      })
      .catch(next);
  });

  app.get('/api/evidence-submissions', (req, res, next) => {
    const status = req.query.status;
    if (status !== undefined && !isEvidenceSubmissionStatus(status)) {
      res.status(400).json({ error: 'status must be pending, attested, or rejected' });
      return;
    }
    deps.store
      .listEvidenceSubmissions(status)
      .then((submissions) => res.json(submissions))
      .catch(next);
  });

  app.post('/api/evidence-submissions/:proofHash/reject', (req, res, next) => {
    if (!isHex(req.params.proofHash)) {
      res.status(400).json({ error: 'proofHash must be a hex string.' });
      return;
    }
    const proofHash = req.params.proofHash;
    deps.store
      .getEvidenceSubmission(proofHash)
      .then((submission) => {
        if (!submission) {
          res.status(404).json({ error: 'No evidence submission found for this proof hash.' });
          return;
        }
        if (submission.status !== 'pending') {
          res.status(409).json({ error: `Evidence submission is already ${submission.status}.` });
          return;
        }

        return deps.store.markEvidenceRejected(proofHash).then(() => res.json({ ok: true }));
      })
      .catch(next);
  });

  app.get('/api/risk-analyses', (_req, res) => {
    res.json(deps.store.listRiskAnalyses());
  });

  app.get('/api/signature-verifications', (_req, res) => {
    res.json(deps.store.listSignatureVerifications());
  });

  app.post('/api/destination-wallet', (req, res, next) => {
    const body = destinationWalletBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'supplier, chain, and address are required' });
      return;
    }

    const validation = validateDestinationWallet({
      chain: body.data.chain,
      address: body.data.address,
    });
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    deps.store
      .registerDestinationWallet({
        supplier: body.data.supplier,
        chain: validation.chain,
        address: validation.address,
        x402ClaimUrl: body.data.x402ClaimUrl,
      })
      .then((record) => res.json(record))
      .catch(next);
  });

  app.get('/api/destination-wallet/:supplier', (req, res, next) => {
    const supplier = req.params.supplier;
    if (!isAddress(supplier)) {
      res.status(400).json({ error: 'supplier must be a valid address' });
      return;
    }
    deps.store
      .getDestinationWallet(supplier)
      .then((record) => {
        if (!record) {
          res.status(404).json({ error: 'No destination wallet registered for this supplier.' });
          return;
        }
        res.json(record);
      })
      .catch(next);
  });

  app.use('/api/fraud-alerts', requireAdminToken);
  app.use('/api/agent-health', requireAdminToken);
  app.use('/api/settlement-queue', requireAdminToken);

  app.get('/api/fraud-alerts', (_req, res, next) => {
    deps.store
      .listFraudAlerts()
      .then((alerts) => res.json(alerts))
      .catch(next);
  });

  app.post('/api/fraud-alerts/:id/approve', (req, res, next) => {
    deps.store
      .getFraudAlert(req.params.id)
      .then((alert) => {
        if (!alert) {
          res.status(404).json({ error: 'No fraud alert found for this reward id.' });
          return;
        }
        if (alert.status !== 'flagged') {
          res.status(409).json({ error: `Fraud alert is already ${alert.status}.` });
          return;
        }

        return deps.store.updateFraudAlertStatus(alert.rewardId, 'approved').then(() => {
          deps.agentControl.approvePayout({
            rewardId: BigInt(alert.rewardId),
            supplier: alert.supplier,
            rewardAmount: BigInt(alert.rewardAmount),
          });
          void anchorFraudResolution(deps, alert.rewardId);
          res.json({ ok: true });
        });
      })
      .catch(next);
  });

  app.post('/api/fraud-alerts/:id/reject', (req, res, next) => {
    deps.store
      .getFraudAlert(req.params.id)
      .then((alert) => {
        if (!alert) {
          res.status(404).json({ error: 'No fraud alert found for this reward id.' });
          return;
        }
        if (alert.status !== 'flagged') {
          res.status(409).json({ error: `Fraud alert is already ${alert.status}.` });
          return;
        }

        return deps.store.updateFraudAlertStatus(alert.rewardId, 'rejected').then(() =>
          deps.store
            .updatePaymentStatus(alert.rewardId, 'failed', {
              error: 'Rejected by admin after fraud review.',
            })
            .then(() => {
              void anchorFraudResolution(deps, alert.rewardId);
              res.json({ ok: true });
            }),
        );
      })
      .catch(next);
  });

  app.get('/api/agent-health', (_req, res, next) => {
    deps.store
      .getAgentHealth()
      .then((health) => res.json(health))
      .catch(next);
  });

  app.get('/api/settlement-queue', (_req, res, next) => {
    deps.store
      .listSettlementJobs()
      .then((jobs) => res.json(jobs))
      .catch(next);
  });

  app.post('/api/wallet-sessions', (req, res, next) => {
    const walletService = requireWalletService(deps, res);
    if (!walletService) {
      return;
    }

    const body = createSessionBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    walletService
      .createSession(body.data.userId)
      .then((session) => res.json({ ...session, appId: walletService.appId }))
      .catch(next);
  });

  app.post('/api/wallet-sessions/:userId/wallet-challenge', (req, res, next) => {
    const walletService = requireWalletService(deps, res);
    if (!walletService) {
      return;
    }

    const body = createWalletChallengeBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'userToken is required' });
      return;
    }

    walletService
      .createWalletChallenge(body.data.userToken, deps.defaultWalletBlockchain)
      .then((challenge) => res.json(challenge))
      .catch(next);
  });

  app.get('/api/wallet-sessions/:userId/wallets', (req, res, next) => {
    const walletService = requireWalletService(deps, res);
    if (!walletService) {
      return;
    }

    const userToken = req.query.userToken;
    if (typeof userToken !== 'string' || !userToken) {
      res.status(400).json({ error: 'userToken query parameter is required' });
      return;
    }

    walletService
      .listWallets(userToken)
      .then((wallets) => res.json(wallets))
      .catch(next);
  });

  app.post('/api/wallet-sessions/:userId/attestation-challenge', (req, res, next) => {
    const walletService = requireWalletService(deps, res);
    if (!walletService) {
      return;
    }

    const body = attestationChallengeBodySchema.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: 'supplier, proofHash, policyId, walletId, userToken are required' });
      return;
    }

    walletService
      .createContractExecutionChallenge({
        userToken: body.data.userToken,
        walletId: body.data.walletId,
        contractAddress: deps.attestationRegistryAddress,
        abiFunctionSignature: 'submitAttestation(address,bytes32,uint256)',
        abiParameters: [body.data.supplier, body.data.proofHash, body.data.policyId],
      })
      .then((challenge) => res.json(challenge))
      .catch(next);
  });

  app.post('/api/wallet-sessions/:userId/transfer-challenge', (req, res, next) => {
    const walletService = requireWalletService(deps, res);
    if (!walletService) {
      return;
    }

    const body = transferChallengeBodySchema.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: 'destinationAddress, amount, walletId, userToken are required' });
      return;
    }

    walletService
      .createTransferChallenge({
        userToken: body.data.userToken,
        walletId: body.data.walletId,
        destinationAddress: body.data.destinationAddress,
        amount: body.data.amount,
        blockchain: deps.defaultWalletBlockchain,
      })
      .then((challenge) => res.json(challenge))
      .catch(next);
  });

  app.post('/api/wallet-sessions/:userId/challenges/:challengeId/tx-hash', (req, res, next) => {
    const walletService = requireWalletService(deps, res);
    if (!walletService) {
      return;
    }

    const body = waitForTxHashBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'userToken is required' });
      return;
    }

    walletService
      .waitForChallengeTxHash(body.data.userToken, req.params.challengeId)
      .then((txHash) => res.json({ txHash }))
      .catch(next);
  });

  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(error);
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : 'Internal server error' });
    },
  );

  return app;
}

function requireWalletService(
  deps: ServerDependencies,
  res: express.Response,
): WalletService | undefined {
  if (!deps.walletService) {
    res.status(503).json({
      error: 'Embedded wallets are not configured. Set CIRCLE_API_KEY, CIRCLE_APP_ID, etc.',
    });
    return undefined;
  }
  return deps.walletService;
}
