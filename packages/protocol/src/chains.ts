import { defineChain } from 'viem';

/**
 * The local Hardhat node started by `npm run contract:node`.
 *
 * Both the agent and the frontend target this chain for the milestone 1 demo.
 * When Arc testnet/mainnet support is added, define an equivalent chain here
 * and select between them by `CHAIN_ID` instead of changing call sites.
 */
export const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
});
