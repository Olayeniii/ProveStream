import type { AgentControl, TreasuryService } from '@provenance-streams/agent';
import { validateDestinationWallet } from '@provenance-streams/agent';
import { createLogger } from '@provenance-streams/logger';
import type {
  EvidenceSubmission,
  EvidenceSubmissionStatus,
  StoreEvent,
  StoreEventKind,
} from '@provenance-streams/protocol';
import { isAddress, isHex } from 'viem';
import cors from 'cors';
import express from 'express';
import type { Express, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';

import type { SessionsRepo } from './db/repositories/sessionsRepo.js';
import type { Role, UsersRepo } from './db/repositories/usersRepo.js';
import type { CircleWebhookService } from './services/circleWebhookService.js';
import {
  computeFraudResolutionAnchor,
  DECISION_TYPE_FRAUD_RESOLUTION,
} from './services/decisionAnchorService.js';
import type { DecisionAnchorService } from './services/decisionAnchorService.js';
import type { PolicyService } from './services/policyService.js';
import type { WalletService } from './services/walletService.js';
import type { Store } from './store.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireRole` once a session token resolves to a real, unexpired session. */
      user?: { userId: string; email: string; role: Role };
    }
  }
}

const logger = createLogger('server');

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
  usersRepo: UsersRepo;
  sessionsRepo: SessionsRepo;
  /** Present only when Circle credentials are configured — gates `POST /api/webhooks/circle`. */
  circleWebhookService: CircleWebhookService | undefined;
  /**
   * Bootstrap credential for the one role with no wallet-based identity of
   * its own — checked only once, inside `POST /api/admin/login`, to mint a
   * real session. Every route after that is gated by `requireRole`, backed
   * by `sessionsRepo`, not by re-checking this token per-request (see
   * docs/decisions.md's superseded note about the old single-shared-token
   * design this replaced).
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

const ADMIN_EMAIL = 'admin@provenance-streams.local';

const createSessionBodySchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['auditor', 'supplier']),
});
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

// A generous ceiling against blunt abuse/misbehaving clients — not meant to
// be felt during normal use, including live SSE-triggered refetches.
const globalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// Applied only to the specific credential-adjacent POSTs (admin login,
// minting a wallet/session, submitting evidence) — brute-forcing/spamming
// those is the actual risk; read routes stay under the generous global
// limit only.
const sensitiveRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Builds the Express app exposing the dashboards' read APIs and the embedded wallet bootstrap. */
export function createServer(deps: ServerDependencies): Express {
  const app = express();
  // Render sits behind a reverse proxy — without this, every request looks
  // like it comes from the proxy's own IP, so every client shares one
  // rate-limit bucket instead of getting its own.
  app.set('trust proxy', 1);
  app.use(cors({ origin: deps.corsOrigin }));
  app.use(globalRateLimit);

  // Registered ahead of the blanket `express.json()` below, deliberately —
  // signature verification needs the exact, untouched request bytes (see
  // CircleWebhookService's docstring); by the time a route registered after
  // `express.json()` runs, the body has already been parsed and
  // re-serializing it changes the byte order the signature was computed
  // over.
  app.post(
    '/api/webhooks/circle',
    sensitiveRateLimit,
    express.raw({ type: 'application/json' }),
    (req, res) => {
      if (!deps.circleWebhookService) {
        res.status(501).json({ error: 'Circle webhooks are not configured.' });
        return;
      }
      const keyId = req.header('X-Circle-Key-Id');
      const signature = req.header('X-Circle-Signature');
      if (!keyId || !signature) {
        res.status(400).json({ error: 'Missing X-Circle-Key-Id or X-Circle-Signature header.' });
        return;
      }

      const rawBody = req.body as Buffer;
      deps.circleWebhookService
        .verify(rawBody, keyId, signature)
        .then((isValid) => {
          if (!isValid) {
            res.status(401).json({ error: 'Invalid webhook signature.' });
            return;
          }
          const payload = JSON.parse(rawBody.toString('utf8')) as {
            notificationType?: string;
            notificationId?: string;
          };
          // Scope for this pass: receive, verify, and log — not wired into
          // any existing polling flow (e.g. WalletService's
          // waitForChallengeTxHash) yet, which is a larger behavioral
          // change tracked separately.
          logger.info('Received verified Circle webhook notification', {
            notificationType: payload.notificationType,
            notificationId: payload.notificationId,
          });
          res.status(200).json({ ok: true });
        })
        .catch((error: unknown) => {
          logger.error('Failed to verify Circle webhook signature', { error });
          res.status(500).json({ error: 'Failed to verify webhook signature.' });
        });
    },
  );

  app.use(express.json());

  /**
   * Gates a route to one or more roles, backed by a real session
   * (`sessionsRepo`) instead of the old single shared `ADMIN_TOKEN` checked
   * by string-equality on every request. Registered ahead of the routes it
   * protects via `app.use(path, requireRole(...))`, never chained inline as
   * a second handler argument on a route with a path param — that broke
   * Express's TS path-param inference (`req.params.id` widened to
   * `string | string[] | undefined`), a real quirk documented in
   * docs/decisions.md, not a style choice.
   */
  const requireRole = (...roles: Role[]): RequestHandler => {
    return (req, res, next) => {
      const header = req.header('Authorization');
      const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
      if (!token) {
        res.status(401).json({ error: 'Missing session token.' });
        return;
      }
      deps.sessionsRepo
        .findByToken(token)
        .then((session) => {
          if (!session || !roles.includes(session.role)) {
            res.status(401).json({ error: 'Missing or invalid session.' });
            return;
          }
          req.user = session;
          next();
        })
        .catch(next);
    };
  };

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Every dashboard used to fetch once on mount and never again — this
  // gives them live updates instead, without inventing new event payloads:
  // `deps.store.onChange` fires a bare `{kind}` signal per mutation (see
  // `StoreEvent`), and the frontend's `useLiveStream` hook reacts by
  // refetching the same `api.listX()` call each page already makes, the
  // same way `AdminDashboard`'s old `setInterval(refresh, 10_000)` polling
  // prototype did — just triggered by a real event instead of a timer. SSE,
  // not WebSocket: this is server→client only, and `EventSource` handles
  // reconnection on its own with zero client-side code.
  const startSseStream = (req: Request, res: Response, filter?: (event: StoreEvent) => boolean) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const unsubscribe = deps.store.onChange((event) => {
      if (!filter || filter(event)) {
        res.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
      }
    });
    // Render's proxy (and most others) drops an idle connection — this
    // keeps it alive without meaning anything to the client.
    const heartbeat = setInterval(() => res.write(':ping\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };

  const ADMIN_ONLY_EVENT_KINDS = new Set<StoreEventKind>(['fraud-alert', 'settlement-job']);

  app.get('/api/events', (req, res) => {
    startSseStream(req, res, (event) => !ADMIN_ONLY_EVENT_KINDS.has(event.kind));
  });

  // `EventSource` can't set custom headers, so this route also accepts the
  // session token as a `?token=` query param — a narrow, SSE-specific
  // exception (query strings can leak into logs/history) that `requireRole`
  // itself deliberately does not support for any other route.
  app.get('/api/events/admin', (req, res) => {
    const header = req.header('Authorization');
    const headerToken = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    const token = headerToken ?? queryToken;
    if (!token) {
      res.status(401).json({ error: 'Missing session token.' });
      return;
    }
    deps.sessionsRepo
      .findByToken(token)
      .then((session) => {
        if (!session || session.role !== 'admin') {
          res.status(401).json({ error: 'Missing or invalid session.' });
          return;
        }
        startSseStream(req, res);
      })
      .catch((error: unknown) => {
        logger.error('Failed to authenticate SSE admin stream:', { error });
        res.status(500).end();
      });
  });

  app.post('/api/admin/login', sensitiveRateLimit, (req, res, next) => {
    const body = adminLoginBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'A token is required.' });
      return;
    }
    if (body.data.token !== deps.adminToken) {
      res.json({ ok: false });
      return;
    }
    deps.usersRepo
      .upsert(ADMIN_EMAIL, 'admin')
      .then((user) => deps.sessionsRepo.create(user.id))
      .then((session) => res.json({ ok: true, sessionToken: session.token }))
      .catch(next);
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

  app.use('/api/policies/:id/register', requireRole('admin'));
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

  app.post('/api/evidence-submissions', sensitiveRateLimit, (req, res, next) => {
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

  app.use('/api/evidence-submissions/:proofHash/reject', requireRole('auditor'));
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

  app.get('/api/risk-analyses', (_req, res, next) => {
    deps.store
      .listRiskAnalyses()
      .then((analyses) => res.json(analyses))
      .catch(next);
  });

  app.get('/api/signature-verifications', (_req, res) => {
    res.json(deps.store.listSignatureVerifications());
  });

  // Inline-chained (not a pre-route `app.use`) since this path has no param
  // to trigger the `req.params` widening bug, and a prefix `app.use` would
  // also gate the sibling `GET /api/destination-wallet/:supplier`, which
  // should stay public.
  app.post('/api/destination-wallet', requireRole('supplier'), (req, res, next) => {
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

  app.use('/api/fraud-alerts', requireRole('admin'));
  app.use('/api/agent-health', requireRole('admin'));
  app.use('/api/settlement-queue', requireRole('admin'));

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

  app.post('/api/wallet-sessions', sensitiveRateLimit, (req, res, next) => {
    const walletService = requireWalletService(deps, res);
    if (!walletService) {
      return;
    }

    const body = createSessionBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'userId and role are required' });
      return;
    }

    Promise.all([
      walletService.createSession(body.data.userId),
      deps.usersRepo
        .upsert(body.data.userId, body.data.role)
        .then((user) => deps.sessionsRepo.create(user.id)),
    ])
      .then(([session, ownSession]) =>
        res.json({ ...session, appId: walletService.appId, sessionToken: ownSession.token }),
      )
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
      logger.error('Unhandled request error', { error });
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
