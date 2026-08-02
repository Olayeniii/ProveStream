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

/**
 * "People remember events, not timestamps" (design language, 1.8 Time) — formats
 * an ISO timestamp as relative progression ("2 minutes ago") rather than a clock time.
 */
export function formatRelativeTime(iso: string): string {
  const diffSeconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);

  if (diffSeconds < 10) {
    return 'just now';
  }
  if (diffSeconds < 60) {
    return `${Math.floor(diffSeconds)}s ago`;
  }
  const minutes = diffSeconds / 60;
  if (minutes < 60) {
    return `${Math.floor(minutes)} min${Math.floor(minutes) === 1 ? '' : 's'} ago`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return `${Math.floor(hours)} hour${Math.floor(hours) === 1 ? '' : 's'} ago`;
  }
  const days = hours / 24;
  return `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} ago`;
}
