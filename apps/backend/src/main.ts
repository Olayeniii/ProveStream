import { createTreasuryService, parseAgentConfig, runAgent } from '@provenance-streams/agent';

import { loadServerConfig } from './env.js';
import { createAttestationReader } from './services/attestationReader.js';
import { PolicyService } from './services/policyService.js';
import { RiskAnalysisService } from './services/riskAnalysisService.js';
import { WalletService } from './services/walletService.js';
import { createServer } from './server.js';
import { Store } from './store.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file present; fall back to whatever is already in process.env.
}

try {
  const config = loadServerConfig();
  const agentConfig = parseAgentConfig(config.agentConfig);
  const store = new Store();

  const treasuryService = createTreasuryService(
    { rpcUrl: config.rpcUrl, chainId: config.chainId },
    agentConfig.treasury,
  );
  const policyService = new PolicyService({
    rpcUrl: config.rpcUrl,
    rewardPolicyAddress: config.rewardPolicyAddress,
  });
  const walletService: WalletService | undefined = config.embeddedWallet
    ? new WalletService({ apiKey: config.embeddedWallet.apiKey, appId: config.embeddedWallet.appId })
    : undefined;
  const riskAnalysisService: RiskAnalysisService | undefined = config.gemini
    ? new RiskAnalysisService({ apiKey: config.gemini.apiKey, model: config.gemini.model })
    : undefined;
  const attestationReader = createAttestationReader({
    rpcUrl: config.rpcUrl,
    attestationRegistryAddress: config.attestationRegistryAddress,
  });

  const stopAgent = runAgent(config.agentConfig, {
    onAttestation: (attestation) => {
      if (
        attestation.id === undefined ||
        attestation.supplier === undefined ||
        attestation.auditor === undefined
      ) {
        return;
      }
      const attestationId = attestation.id.toString();
      store.addAttestation({
        id: attestationId,
        supplier: attestation.supplier,
        auditor: attestation.auditor,
        policyId: (attestation.policyId ?? 0n).toString(),
        observedAt: new Date().toISOString(),
      });

      if (!riskAnalysisService) {
        return;
      }
      const attestationIdValue = attestation.id;
      attestationReader
        .getProofHash(attestationIdValue)
        .then((proofHash) => {
          const evidenceText = store.takePendingEvidence(proofHash);
          if (!evidenceText) {
            return undefined;
          }
          store.createPendingRiskAnalysis(attestationId);
          return riskAnalysisService
            .analyzeEvidence({ evidenceText, policyId: (attestation.policyId ?? 0n).toString() })
            .then((result) => store.updateRiskAnalysisStatus(attestationId, 'complete', result))
            .catch((error: unknown) => {
              store.updateRiskAnalysisStatus(attestationId, 'failed', {
                error: error instanceof Error ? error.message : 'Risk analysis failed.',
              });
            });
        })
        .catch((error: unknown) => {
          console.error('Failed to read attestation for risk analysis:', error);
        });
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
        store.updatePaymentStatus(rewardId.toString(), 'complete', { txHash: settlement.txHash });
      } else {
        store.updatePaymentStatus(rewardId.toString(), 'failed', { error: settlement.error });
      }
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
    stopAgent();
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('Failed to start backend: invalid configuration.\n', error);
  process.exitCode = 1;
}
