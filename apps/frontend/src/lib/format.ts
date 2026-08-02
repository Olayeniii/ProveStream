import { formatUnits } from 'viem';

/** Truncates a decimal amount string to a fixed number of places, without rounding up. */
export function formatAmount(value: string, places = 2): string {
  const [whole = '0', fraction = ''] = value.split('.');
  return fraction ? `${whole}.${fraction.slice(0, places)}` : whole;
}

/**
 * Formats a reward/policy amount stored in the smallest unit of Arc's native
 * USDC (18 decimals, same precision as the chain's native gas token) into a
 * human-readable USDC value.
 */
export function formatReward(rawAmount: string): string {
  return `${formatAmount(formatUnits(BigInt(rawAmount), 18), 2)} USDC`;
}
