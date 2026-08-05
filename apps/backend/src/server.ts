import type { AgentControl, TreasuryService } from '@provenance-streams/agent';
import { validateDestinationWallet } from '@provenance-streams/agent';
import { isAddress, isHex } from 'viem';
import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import { z } from 'zod';

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
}

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
const evidenceBodySchema = z.object({
  proofHash: z.string().refine(isHex),
  evidenceText: z.string().min(1),
});
const destinationWalletBodySchema = z.object({
  supplier: z.string().refine(isAddress),
  chain: z.string().min(1),
  address: z.string().min(1),
});

/** Builds the Express app exposing the dashboards' read APIs and the embedded wallet bootstrap. */
export function createServer(deps: ServerDependencies): Express {
  const app = express();
  app.use(cors({ origin: deps.corsOrigin }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
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

  app.get('/api/attestations', (_req, res) => {
    res.json(deps.store.listAttestations());
  });

  app.get('/api/payments', (_req, res) => {
    res.json(deps.store.listPayments());
  });

  app.post('/api/evidence', (req, res) => {
    const body = evidenceBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'proofHash and evidenceText are required' });
      return;
    }

    deps.store.addPendingEvidence(body.data.proofHash, body.data.evidenceText);
    res.json({ ok: true });
  });

  app.get('/api/risk-analyses', (_req, res) => {
    res.json(deps.store.listRiskAnalyses());
  });

  app.get('/api/signature-verifications', (_req, res) => {
    res.json(deps.store.listSignatureVerifications());
  });

  app.post('/api/destination-wallet', (req, res) => {
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

    const record = deps.store.registerDestinationWallet({
      supplier: body.data.supplier,
      chain: validation.chain,
      address: validation.address,
    });
    res.json(record);
  });

  app.get('/api/destination-wallet/:supplier', (req, res) => {
    const supplier = req.params.supplier;
    if (!isAddress(supplier)) {
      res.status(400).json({ error: 'supplier must be a valid address' });
      return;
    }
    const record = deps.store.getDestinationWallet(supplier);
    if (!record) {
      res.status(404).json({ error: 'No destination wallet registered for this supplier.' });
      return;
    }
    res.json(record);
  });

  app.get('/api/fraud-alerts', (_req, res) => {
    res.json(deps.store.listFraudAlerts());
  });

  app.post('/api/fraud-alerts/:id/approve', (req, res) => {
    const alert = deps.store.getFraudAlert(req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'No fraud alert found for this reward id.' });
      return;
    }
    if (alert.status !== 'flagged') {
      res.status(409).json({ error: `Fraud alert is already ${alert.status}.` });
      return;
    }

    deps.store.updateFraudAlertStatus(alert.rewardId, 'approved');
    deps.agentControl.approvePayout({
      rewardId: BigInt(alert.rewardId),
      supplier: alert.supplier,
      rewardAmount: BigInt(alert.rewardAmount),
    });
    res.json({ ok: true });
  });

  app.post('/api/fraud-alerts/:id/reject', (req, res) => {
    const alert = deps.store.getFraudAlert(req.params.id);
    if (!alert) {
      res.status(404).json({ error: 'No fraud alert found for this reward id.' });
      return;
    }
    if (alert.status !== 'flagged') {
      res.status(409).json({ error: `Fraud alert is already ${alert.status}.` });
      return;
    }

    deps.store.updateFraudAlertStatus(alert.rewardId, 'rejected');
    deps.store.updatePaymentStatus(alert.rewardId, 'failed', {
      error: 'Rejected by admin after fraud review.',
    });
    res.json({ ok: true });
  });

  app.get('/api/agent-health', (_req, res) => {
    res.json(deps.store.getAgentHealth());
  });

  app.get('/api/settlement-queue', (_req, res) => {
    res.json(deps.store.listSettlementJobs());
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
