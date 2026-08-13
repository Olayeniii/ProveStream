import type { Pool } from 'pg';

/**
 * Generic key/value persistence for resumable-scan cursors — replaces the
 * `knownPolicyIds`/`scannedThroughBlock` fields previously bolted onto
 * `snapshotStore.ts`'s `Snapshot` type. `PolicyService`'s known-policy-id
 * set and `HistoryService`'s two backfill cursors each get one row, keyed
 * by a fixed name.
 */
export function createChainScanProgressRepo(pool: Pool) {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const result = await pool.query<{ value: T }>(
        'SELECT value FROM chain_scan_progress WHERE key = $1',
        [key],
      );
      return result.rows[0]?.value;
    },

    async set(key: string, value: unknown): Promise<void> {
      await pool.query(
        `INSERT INTO chain_scan_progress (key, value, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value)],
      );
    },
  };
}

export type ChainScanProgressRepo = ReturnType<typeof createChainScanProgressRepo>;
