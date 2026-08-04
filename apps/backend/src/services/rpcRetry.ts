const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `fn` with exponential backoff. Public RPC providers (Arc testnet
 * included) intermittently return transient errors under load — most
 * visibly "request limit reached" when a service issues many `eth_getLogs`
 * calls back to back at startup (`PolicyService`'s chunked scan,
 * `HistoryService`'s backfill). Those aren't permanent failures, just a
 * signal to slow down and retry.
 */
export async function withRpcRetries<T>(
  fn: () => Promise<T>,
  { maxAttempts = DEFAULT_MAX_ATTEMPTS, baseDelayMs = DEFAULT_BASE_DELAY_MS } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
