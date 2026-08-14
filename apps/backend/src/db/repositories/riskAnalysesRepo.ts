import type { RiskAnalysis, RiskAnalysisStatus } from '@provenance-streams/protocol';
import type { Pool } from 'pg';

interface Row {
  attestation_id: string;
  status: RiskAnalysisStatus;
  score: number | null;
  confidence: number | null;
  summary: string | null;
  provider: string | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

function toRiskAnalysis(row: Row): RiskAnalysis {
  return {
    attestationId: row.attestation_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    ...(row.score !== null ? { score: row.score } : {}),
    ...(row.confidence !== null ? { confidence: row.confidence } : {}),
    ...(row.summary !== null ? { summary: row.summary } : {}),
    ...(row.provider !== null ? { provider: row.provider } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
  };
}

export function createRiskAnalysesRepo(pool: Pool) {
  return {
    async createPending(attestationId: string): Promise<void> {
      await pool.query(
        `INSERT INTO risk_analyses (attestation_id, status, created_at, updated_at)
         VALUES ($1, 'pending', now(), now())
         ON CONFLICT (attestation_id) DO UPDATE SET status = 'pending', updated_at = now()`,
        [attestationId],
      );
    },

    async updateStatus(
      attestationId: string,
      status: RiskAnalysisStatus,
      extra?: {
        score?: number;
        confidence?: number;
        summary?: string;
        provider?: string;
        error?: string;
      },
    ): Promise<void> {
      await pool.query(
        `UPDATE risk_analyses
         SET status = $2,
             updated_at = now(),
             score = COALESCE($3, score),
             confidence = COALESCE($4, confidence),
             summary = COALESCE($5, summary),
             provider = COALESCE($6, provider),
             error = COALESCE($7, error)
         WHERE attestation_id = $1`,
        [
          attestationId,
          status,
          extra?.score ?? null,
          extra?.confidence ?? null,
          extra?.summary ?? null,
          extra?.provider ?? null,
          extra?.error ?? null,
        ],
      );
    },

    async list(): Promise<RiskAnalysis[]> {
      const result = await pool.query<Row>('SELECT * FROM risk_analyses ORDER BY created_at DESC');
      return result.rows.map(toRiskAnalysis);
    },

    async get(attestationId: string): Promise<RiskAnalysis | undefined> {
      const result = await pool.query<Row>(
        'SELECT * FROM risk_analyses WHERE attestation_id = $1',
        [attestationId],
      );
      return result.rows[0] ? toRiskAnalysis(result.rows[0]) : undefined;
    },
  };
}

export type RiskAnalysesRepo = ReturnType<typeof createRiskAnalysesRepo>;
