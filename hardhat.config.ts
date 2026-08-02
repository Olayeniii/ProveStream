import hardhatToolboxViemPlugin from '@nomicfoundation/hardhat-toolbox-viem';
import { defineConfig } from 'hardhat/config';

try {
  process.loadEnvFile();
} catch {
  // No .env file present; fall back to whatever is already in process.env.
}

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: '0.8.28',
      },
      production: {
        version: '0.8.28',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: 'edr-simulated',
      chainType: 'l1',
    },
    // Circle's Arc public testnet — see README's "Deployment guide (Arc testnet)".
    // RPC_URL/OPERATOR_PRIVATE_KEY are shared with the backend/agent's own .env
    // config (the whole .env represents one target network at a time).
    arcTestnet: {
      type: 'http',
      url: process.env.RPC_URL ?? 'https://rpc.testnet.arc.io',
      chainId: 5042002,
      accounts: process.env.OPERATOR_PRIVATE_KEY ? [process.env.OPERATOR_PRIVATE_KEY] : [],
    },
  },
});
