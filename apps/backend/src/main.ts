import { runAgent } from '@provenance-streams/agent';

try {
  process.loadEnvFile();
} catch {
  // No .env file present; fall back to whatever is already in process.env.
}

try {
  const stop = runAgent({
    rpcUrl: process.env.RPC_URL ?? '',
    contractAddress: process.env.CONTRACT_ADDRESS ?? '',
    chainId: process.env.CHAIN_ID ?? '',
  });

  const shutdown = () => {
    stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('Failed to start agent: invalid configuration.\n', error);
  process.exitCode = 1;
}
