import type { SettlementJobRecord, SettlementJobState } from '@provenance-streams/protocol';
import type { Pool } from 'pg';

interface Row {
  reward_id: string;
  state: SettlementJobState;
  attempt: number | null;
  error: string | null;
  updated_at: Date;
}

function toJob(row: Row): SettlementJobRecord {
  return {
    rewardId: row.reward_id,
    state: row.state,
    attempt: row.attempt ?? undefined,
    error: row.error ?? undefined,
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createSettlementJobsRepo(pool: Pool) {
  return {
    /** Full overwrite on conflict, matching the in-memory `Store`'s prior `Map.set` semantics (always writes a complete new record, not a partial merge). */
    async updateState(
      rewardId: string,
      state: SettlementJobState,
      extra?: { attempt?: number | undefined; error?: string | undefined },
    ): Promise<void> {
      await pool.query(
        `INSERT INTO settlement_jobs (reward_id, state, attempt, error, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (reward_id) DO UPDATE SET
           state = EXCLUDED.state,
           attempt = EXCLUDED.attempt,
           error = EXCLUDED.error,
           updated_at = now()`,
        [rewardId, state, extra?.attempt ?? null, extra?.error ?? null],
      );
    },

    async list(): Promise<SettlementJobRecord[]> {
      const result = await pool.query<Row>(
        'SELECT * FROM settlement_jobs ORDER BY updated_at DESC',
      );
      return result.rows.map(toJob);
    },

    /** Count of jobs currently waiting or in flight — backs `Store.getAgentHealth()`'s `queueDepth`. */
    async queueDepth(): Promise<number> {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*) FROM settlement_jobs WHERE state IN ('queued', 'processing', 'retrying')`,
      );
      return Number(result.rows[0]?.count ?? 0);
    },
  };
}

export type SettlementJobsRepo = ReturnType<typeof createSettlementJobsRepo>;
