import { createTreasuryService, parseAgentConfig, runAgent } from '@provenance-streams/agent';

import { loadServerConfig } from './env.js';
import { PolicyService } from './services/policyService.js';
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
  const walletService: WalletService | undefined = config.circle
    ? new WalletService({ apiKey: config.circle.apiKey, appId: config.circle.appId })
    : undefined;

  const stopAgent = runAgent(config.agentConfig, {
    onAttestation: (attestation) => {
      if (
        attestation.id === undefined ||
        attestation.supplier === undefined ||
        attestation.auditor === undefined
      ) {
        return;
      }
      store.addAttestation({
        id: attestation.id.toString(),
        supplier: attestation.supplier,
        auditor: attestation.auditor,
        policyId: (attestation.policyId ?? 0n).toString(),
        observedAt: new Date().toISOString(),
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
    if (!config.circle) {
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
