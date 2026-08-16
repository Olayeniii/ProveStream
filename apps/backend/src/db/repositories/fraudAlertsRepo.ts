import type { DecisionAnchor, FraudAlert, FraudAlertStatus } from '@provenance-streams/protocol';
import type { Pool } from 'pg';
import type { Address, Hex } from 'viem';

interface Row {
  reward_id: string;
  attestation_id: string;
  supplier: string;
  policy_id: string;
  reward_amount: string;
  score: number;
  reasons: string[];
  status: FraudAlertStatus;
  resolution_anchor: DecisionAnchor | null;
  resolved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

function toAlert(row: Row): FraudAlert {
  return {
    rewardId: row.reward_id,
    attestationId: row.attestation_id,
    supplier: row.supplier as Address,
    policyId: row.policy_id,
    rewardAmount: row.reward_amount,
    score: row.score,
    reasons: row.reasons,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.resolution_anchor ? { resolutionAnchor: row.resolution_anchor } : {}),
    ...(row.resolved_by ? { resolvedBy: row.resolved_by } : {}),
  };
}

export function createFraudAlertsRepo(pool: Pool) {
  return {
    async create(input: {
      rewardId: string;
      attestationId: string;
      supplier: Address;
      policyId: string;
      rewardAmount: string;
      score: number;
      reasons: string[];
    }): Promise<void> {
      await pool.query(
        `INSERT INTO fraud_alerts (reward_id, attestation_id, supplier, policy_id, reward_amount, score, reasons, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'flagged', now(), now())`,
        [
          input.rewardId,
          input.attestationId,
          input.supplier,
          input.policyId,
          input.rewardAmount,
          input.score,
          JSON.stringify(input.reasons),
        ],
      );
    },

    async get(rewardId: string): Promise<FraudAlert | undefined> {
      const result = await pool.query<Row>('SELECT * FROM fraud_alerts WHERE reward_id = $1', [
        rewardId,
      ]);
      return result.rows[0] ? toAlert(result.rows[0]) : undefined;
    },

    async updateStatus(
      rewardId: string,
      status: FraudAlertStatus,
      resolvedBy?: string,
    ): Promise<void> {
      await pool.query(
        'UPDATE fraud_alerts SET status = $2, resolved_by = $3, updated_at = now() WHERE reward_id = $1',
        [rewardId, status, resolvedBy ?? null],
      );
    },

    /** Tracks whether this alert's resolution has been anchored on `DecisionRegistry` (see `DecisionAnchorService`). */
    async updateAnchor(rewardId: string, status: DecisionAnchor['status'], txHash?: Hex) {
      const anchor: DecisionAnchor = { status, ...(txHash ? { txHash } : {}) };
      await pool.query(
        'UPDATE fraud_alerts SET resolution_anchor = $2::jsonb WHERE reward_id = $1',
        [rewardId, JSON.stringify(anchor)],
      );
    },

    async list(): Promise<FraudAlert[]> {
      const result = await pool.query<Row>('SELECT * FROM fraud_alerts ORDER BY created_at DESC');
      return result.rows.map(toAlert);
    },

    /** Count of alerts still awaiting an admin decision — backs `Store.getAgentHealth()`'s `pendingFraudAlerts`. */
    async pendingCount(): Promise<number> {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*) FROM fraud_alerts WHERE status = 'flagged'`,
      );
      return Number(result.rows[0]?.count ?? 0);
    },
  };
}

export type FraudAlertsRepo = ReturnType<typeof createFraudAlertsRepo>;
