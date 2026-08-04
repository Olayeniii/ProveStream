import { SUPPORTED_DESTINATION_CHAINS } from '@provenance-streams/protocol';
import type { SupportedDestinationChain } from '@provenance-streams/protocol';
import { isAddress } from 'viem';
import type { Address } from 'viem';

export { SUPPORTED_DESTINATION_CHAINS };
export type { SupportedDestinationChain };

export interface DestinationWalletInput {
  chain: string;
  address: string;
}

export type DestinationWalletValidation =
  | { valid: true; chain: SupportedDestinationChain; address: Address }
  | { valid: false; error: string };

/** Validates a supplier's requested destination wallet before it's stored or bridged to. */
export function validateDestinationWallet(input: DestinationWalletInput): DestinationWalletValidation {
  if (!isAddress(input.address)) {
    return { valid: false, error: 'Not a valid EVM address.' };
  }
  if (!SUPPORTED_DESTINATION_CHAINS.includes(input.chain as SupportedDestinationChain)) {
    return {
      valid: false,
      error: `Unsupported destination chain "${input.chain}". Supported: ${SUPPORTED_DESTINATION_CHAINS.join(', ')}.`,
    };
  }
  return { valid: true, chain: input.chain as SupportedDestinationChain, address: input.address };
}
