import type { EvidenceSubmission, EvidenceSubmissionStatus } from '@provenance-streams/protocol';
import type { Pool } from 'pg';
import type { Address, Hex } from 'viem';

interface Row {
  id: string;
  proof_hash: string;
  supplier: string;
  policy_id: string;
  evidence_text: string;
  status: EvidenceSubmissionStatus;
  attestation_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function toSubmission(row: Row): EvidenceSubmission {
  return {
    id: row.id,
    supplier: row.supplier as Address,
    policyId: row.policy_id,
    proofHash: row.proof_hash as Hex,
    evidenceText: row.evidence_text,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.attestation_id ? { attestationId: row.attestation_id } : {}),
  };
}

export function createEvidenceSubmissionsRepo(pool: Pool) {
  return {
    /** `proofHash` is computed by the caller (`keccak256(toHex(evidenceText))`, matching what `AttestationRegistry` expects on-chain), same as before. */
    async create(input: {
      supplier: Address;
      policyId: string;
      evidenceText: string;
      proofHash: Hex;
    }): Promise<EvidenceSubmission> {
      const result = await pool.query<Row>(
        `INSERT INTO evidence_submissions (proof_hash, supplier, policy_id, evidence_text, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', now(), now())
         RETURNING *`,
        [input.proofHash, input.supplier, input.policyId, input.evidenceText],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('Failed to insert evidence submission.');
      }
      return toSubmission(row);
    },

    /** Non-destructive — a submission stays queryable after an auditor attests to it. */
    async getByProofHash(proofHash: Hex): Promise<EvidenceSubmission | undefined> {
      const result = await pool.query<Row>(
        'SELECT * FROM evidence_submissions WHERE proof_hash = $1',
        [proofHash],
      );
      return result.rows[0] ? toSubmission(result.rows[0]) : undefined;
    },

    async list(status?: EvidenceSubmissionStatus): Promise<EvidenceSubmission[]> {
      const result = status
        ? await pool.query<Row>(
            'SELECT * FROM evidence_submissions WHERE status = $1 ORDER BY created_at DESC',
            [status],
          )
        : await pool.query<Row>('SELECT * FROM evidence_submissions ORDER BY created_at DESC');
      return result.rows.map(toSubmission);
    },

    async markAttested(proofHash: Hex, attestationId: string): Promise<void> {
      await pool.query(
        `UPDATE evidence_submissions
         SET status = 'attested', attestation_id = $2, updated_at = now()
         WHERE proof_hash = $1 AND status = 'pending'`,
        [proofHash, attestationId],
      );
    },

    async markRejected(proofHash: Hex): Promise<void> {
      await pool.query(
        `UPDATE evidence_submissions
         SET status = 'rejected', updated_at = now()
         WHERE proof_hash = $1 AND status = 'pending'`,
        [proofHash],
      );
    },
  };
}

export type EvidenceSubmissionsRepo = ReturnType<typeof createEvidenceSubmissionsRepo>;
