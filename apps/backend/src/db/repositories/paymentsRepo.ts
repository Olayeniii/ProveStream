import type { Payment, PaymentStatus } from '@provenance-streams/protocol';
import type { Pool } from 'pg';
import type { Address, Hex } from 'viem';

interface Row {
  reward_id: string;
  attestation_id: string;
  supplier: string;
  policy_id: string;
  reward_amount: string;
  status: PaymentStatus;
  tx_hash: string | null;
  error: string | null;
  bridged: boolean | null;
  destination_chain: string | null;
  destination_tx_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

function toPayment(row: Row): Payment {
  return {
    rewardId: row.reward_id,
    attestationId: row.attestation_id,
    supplier: row.supplier as Address,
    policyId: row.policy_id,
    rewardAmount: row.reward_amount,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.tx_hash ? { txHash: row.tx_hash as Hex } : {}),
    ...(row.error ? { error: row.error } : {}),
    ...(row.bridged !== null ? { bridged: row.bridged } : {}),
    ...(row.destination_chain ? { destinationChain: row.destination_chain } : {}),
    ...(row.destination_tx_hash ? { destinationTxHash: row.destination_tx_hash as Hex } : {}),
  };
}

export function createPaymentsRepo(pool: Pool) {
  return {
    /** Full overwrite on conflict, matching the in-memory `Store`'s prior `Map.set` semantics. */
    async createPending(input: {
      rewardId: string;
      attestationId: string;
      supplier: Address;
      policyId: string;
      rewardAmount: string;
    }): Promise<void> {
      await pool.query(
        `INSERT INTO payments (reward_id, attestation_id, supplier, policy_id, reward_amount, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'pending', now(), now())
         ON CONFLICT (reward_id) DO UPDATE SET
           attestation_id = EXCLUDED.attestation_id,
           supplier = EXCLUDED.supplier,
           policy_id = EXCLUDED.policy_id,
           reward_amount = EXCLUDED.reward_amount,
           status = 'pending',
           tx_hash = NULL,
           error = NULL,
           bridged = NULL,
           destination_chain = NULL,
           destination_tx_hash = NULL,
           created_at = now(),
           updated_at = now()`,
        [input.rewardId, input.attestationId, input.supplier, input.policyId, input.rewardAmount],
      );
    },

    /** Partial merge — only overwrites fields present in `extra`, same as the original `Map`-backed method. */
    async updateStatus(
      rewardId: string,
      status: PaymentStatus,
      extra?: {
        txHash?: Hex;
        error?: string;
        bridged?: boolean | undefined;
        destinationChain?: string | undefined;
        destinationTxHash?: Hex;
      },
    ): Promise<void> {
      await pool.query(
        `UPDATE payments SET
           status = $2,
           tx_hash = COALESCE($3, tx_hash),
           error = COALESCE($4, error),
           bridged = COALESCE($5, bridged),
           destination_chain = COALESCE($6, destination_chain),
           destination_tx_hash = COALESCE($7, destination_tx_hash),
           updated_at = now()
         WHERE reward_id = $1`,
        [
          rewardId,
          status,
          extra?.txHash ?? null,
          extra?.error ?? null,
          extra?.bridged ?? null,
          extra?.destinationChain ?? null,
          extra?.destinationTxHash ?? null,
        ],
      );
    },

    async list(): Promise<Payment[]> {
      const result = await pool.query<Row>('SELECT * FROM payments ORDER BY created_at DESC');
      return result.rows.map(toPayment);
    },
  };
}

export type PaymentsRepo = ReturnType<typeof createPaymentsRepo>;
