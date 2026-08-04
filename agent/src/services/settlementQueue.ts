export type JobState = 'queued' | 'processing' | 'retrying' | 'settled' | 'failed';

export interface SettlementJob {
  id: string;
  execute: () => Promise<void>;
}

export interface SettlementQueueConfig {
  /** Total attempts (including the first) before a job is marked permanently failed. */
  maxAttempts: number;
  /** Base delay for exponential backoff between retries: `baseDelayMs * 2^(attempt-1)`. */
  baseDelayMs: number;
}

const DEFAULT_CONFIG: SettlementQueueConfig = {
  maxAttempts: 3,
  baseDelayMs: 2_000,
};

export interface SettlementQueueHooks {
  onStateChange?: (
    jobId: string,
    state: JobState,
    extra?: { attempt?: number; error?: unknown },
  ) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lightweight in-memory settlement job queue — no new infrastructure
 * dependency (Redis, etc.), consistent with this project's existing
 * in-memory `Store` pattern (`apps/backend/src/store.ts`).
 *
 * Processes one job at a time (settlement transactions share the treasury's
 * nonce, so concurrent processing would race), retrying recoverable
 * failures with exponential backoff up to `maxAttempts` before giving up.
 * This doesn't distinguish recoverable from permanent errors up front —
 * transient errors (RPC hiccups, bridge timeouts) succeed on retry;
 * permanent ones (e.g. an invalid recipient) simply exhaust their attempts
 * and land in `failed`, which is the correct outcome either way.
 */
export class SettlementQueue {
  private readonly config: SettlementQueueConfig;
  private readonly queue: SettlementJob[] = [];
  private processing = false;

  constructor(
    config: Partial<SettlementQueueConfig> = {},
    private readonly hooks: SettlementQueueHooks = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  enqueue(job: SettlementJob): void {
    this.queue.push(job);
    this.hooks.onStateChange?.(job.id, 'queued');
    void this.drain();
  }

  /** Number of jobs waiting or currently processing — surfaced as "queue depth" on the Admin dashboard. */
  depth(): number {
    return this.queue.length + (this.processing ? 1 : 0);
  }

  private async drain(): Promise<void> {
    if (this.processing) {
      return;
    }
    const job = this.queue.shift();
    if (!job) {
      return;
    }

    this.processing = true;
    await this.runWithRetries(job);
    this.processing = false;

    void this.drain();
  }

  private async runWithRetries(job: SettlementJob): Promise<void> {
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      this.hooks.onStateChange?.(job.id, 'processing', { attempt });
      try {
        await job.execute();
        this.hooks.onStateChange?.(job.id, 'settled');
        return;
      } catch (error) {
        if (attempt >= this.config.maxAttempts) {
          this.hooks.onStateChange?.(job.id, 'failed', { attempt, error });
          return;
        }
        this.hooks.onStateChange?.(job.id, 'retrying', { attempt, error });
        await sleep(this.config.baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }
}
