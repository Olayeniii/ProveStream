import type { Pool } from 'pg';
import type { Address, Hex } from 'viem';

export interface AttestationRecord {
  id: string;
  supplier: Address;
  auditor: Address;
  policyId: string;
  observedAt: string;
  /** The `submitAttestation` transaction that produced this record — kept so a restart can (re-)run signature verification without needing a fresh chain scan. */
  transactionHash: Hex;
}

const LIST_LIMIT = 200;

interface Row {
  id: string;
  supplier: string;
  auditor: string;
  policy_id: string;
  observed_at: Date;
  transaction_hash: string;
}

function toRecord(row: Row): AttestationRecord {
  return {
    id: row.id,
    supplier: row.supplier as Address,
    auditor: row.auditor as Address,
    policyId: row.policy_id,
    observedAt: row.observed_at.toISOString(),
    transactionHash: row.transaction_hash as Hex,
  };
}

export function createAttestationsRepo(pool: Pool) {
  return {
    /** Idempotent by `id` — returns whether a new row was actually inserted (both the live watcher and `HistoryService`'s backfill can observe the same attestation). */
    async insertIfNew(record: AttestationRecord): Promise<boolean> {
      const result = await pool.query(
        `INSERT INTO attestations (id, supplier, auditor, policy_id, observed_at, transaction_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          record.id,
          record.supplier,
          record.auditor,
          record.policyId,
          record.observedAt,
          record.transactionHash,
        ],
      );
      return (result.rowCount ?? 0) > 0;
    },

    /** Newest-first, capped at `LIST_LIMIT` — matches the in-memory `Store`'s prior cap semantics. */
    async list(): Promise<AttestationRecord[]> {
      const result = await pool.query<Row>(
        `SELECT * FROM attestations ORDER BY observed_at DESC LIMIT $1`,
        [LIST_LIMIT],
      );
      return result.rows.map(toRecord);
    },
  };
}

export type AttestationsRepo = ReturnType<typeof createAttestationsRepo>;
