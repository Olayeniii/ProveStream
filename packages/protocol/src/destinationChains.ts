import { isAddress } from 'viem';

/**
 * Destination chains this deployment can actually bridge to via the agent's
 * `bridgeService.ts` (Arc App Kit's CCTP `bridge()`). A single source of
 * truth shared between the backend's registration endpoint, the agent's
 * bridge decision, and the frontend's destination-wallet form, so they can
 * never disagree about what's supported.
 */
export const SUPPORTED_DESTINATION_CHAINS = [
  'Ethereum_Sepolia',
  'Base_Sepolia',
  'Solana_Devnet',
] as const;
export type SupportedDestinationChain = (typeof SUPPORTED_DESTINATION_CHAINS)[number];

export interface DestinationWalletInput {
  chain: string;
  address: string;
}

export type DestinationWalletValidation =
  | { valid: true; chain: SupportedDestinationChain; address: string }
  | { valid: false; error: string };

/**
 * Base58, 32-44 chars (Solana's actual alphabet excludes 0/O/I/l to avoid
 * visual ambiguity) — a lightweight format check, not a full base58 decode +
 * length-in-bytes verification. Good enough to reject an obviously-wrong
 * paste (an EVM address, a typo) without pulling in a Solana SDK dependency
 * just for address validation.
 */
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Validates a supplier's requested destination wallet before it's stored or
 * bridged to. Lives here (not `agent`) so the frontend's registration form
 * can reuse the exact same check instead of duplicating the Solana pattern
 * and risking drift — same reasoning as `SUPPORTED_DESTINATION_CHAINS` itself.
 */
export function validateDestinationWallet(
  input: DestinationWalletInput,
): DestinationWalletValidation {
  if (!SUPPORTED_DESTINATION_CHAINS.includes(input.chain as SupportedDestinationChain)) {
    return {
      valid: false,
      error: `Unsupported destination chain "${input.chain}". Supported: ${SUPPORTED_DESTINATION_CHAINS.join(', ')}.`,
    };
  }
  const chain = input.chain as SupportedDestinationChain;

  if (chain === 'Solana_Devnet') {
    if (!SOLANA_ADDRESS_PATTERN.test(input.address)) {
      return { valid: false, error: 'Not a valid Solana address.' };
    }
  } else if (!isAddress(input.address)) {
    return { valid: false, error: 'Not a valid EVM address.' };
  }

  return { valid: true, chain, address: input.address };
}
