/**
 * Destination chains this deployment can actually bridge to via the agent's
 * `bridgeService.ts` (Arc App Kit's CCTP `bridge()`). A single source of
 * truth shared between the backend's registration endpoint, the agent's
 * bridge decision, and the frontend's destination-wallet form, so they can
 * never disagree about what's supported.
 */
export const SUPPORTED_DESTINATION_CHAINS = ['Ethereum_Sepolia'] as const;
export type SupportedDestinationChain = (typeof SUPPORTED_DESTINATION_CHAINS)[number];
