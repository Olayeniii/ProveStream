import { SUPPORTED_DESTINATION_CHAINS } from '@provenance-streams/protocol';
import type { SupportedDestinationChain } from '@provenance-streams/protocol';
import { isAddress } from 'viem';

export { SUPPORTED_DESTINATION_CHAINS };
export type { SupportedDestinationChain };

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

/** Validates a supplier's requested destination wallet before it's stored or bridged to. */
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
