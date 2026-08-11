const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_BASE_DELAY_MS = 800;

/**
 * Arc testnet's public RPC endpoint throttles hard — observed failing
 * `eth_getLogs`/`getBlock` calls after only a handful fired close together
 * at backend startup (`PolicyService`'s chunked policy scan running
 * alongside `HistoryService`'s attestation/reward backfill). Retrying each
 * call independently isn't enough on its own: several *different* call
 * sites each retrying in parallel just stack their bursts back on top of
 * each other. This module-level `nextAvailableAt` is a simple shared gate —
 * every call to `withRpcRetries`, from any service, queues behind it — so
 * the whole process stays under the limit collectively, not just per call.
 */
const MIN_INTERVAL_MS = 350;
let nextAvailableAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTurn(): Promise<void> {
  const now = Date.now();
  const waitMs = Math.max(0, nextAvailableAt - now);
  nextAvailableAt = Math.max(now, nextAvailableAt) + MIN_INTERVAL_MS;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

/**
 * Paces `fn` behind the shared gate above, then retries it with exponential
 * backoff if it still fails — the backoff is a safety net for genuine
 * transient errors; the pacing is what actually keeps the rate limit from
 * tripping in the first place.
 */
/**
 * Reduces an RPC failure to one line for logging. viem's rate-limit errors
 * carry a short, human `shortMessage`/`details` plus a deeply nested `cause`
 * chain (URL, request body, stack, the same info repeated at each layer) —
 * printing the raw error via `console.error(msg, error)` dumps all of that,
 * which is what floods the log on Arc testnet's frequent rate limiting.
 */
export function summarizeRpcError(error: unknown): string {
  if (error && typeof error === 'object') {
    const withMessages = error as { shortMessage?: unknown; details?: unknown };
    if (typeof withMessages.shortMessage === 'string') {
      return typeof withMessages.details === 'string'
        ? `${withMessages.shortMessage} (${withMessages.details})`
        : withMessages.shortMessage;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

export async function withRpcRetries<T>(
  fn: () => Promise<T>,
  { maxAttempts = DEFAULT_MAX_ATTEMPTS, baseDelayMs = DEFAULT_BASE_DELAY_MS } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await waitForTurn();
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}
