import { defineChain } from 'viem';

/**
 * The local Hardhat node started by `npm run contract:node`.
 *
 * Used for local development and the milestone demo. When targeting real Arc
 * infrastructure, select `arcTestnet` instead by `CHAIN_ID` rather than
 * changing call sites.
 */
export const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
});

/**
 * Circle's Arc public testnet. USDC is the native gas token (18 decimals), so a
 * "USDC transfer" on Arc is a native-currency transfer, not an ERC-20 call —
 * the same shape as sending `hardhatLocal`'s native currency locally.
 *
 * @see https://docs.arc.io/arc/references/connect-to-arc
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' },
  },
});
