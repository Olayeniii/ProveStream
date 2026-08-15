import { createHash, randomBytes } from 'node:crypto';

import type { Pool } from 'pg';

import type { Role } from './usersRepo.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface AuthenticatedSession {
  userId: string;
  email: string;
  role: Role;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface Row {
  user_id: string;
  email: string;
  role: Role;
}

export function createSessionsRepo(pool: Pool) {
  return {
    /** Returns the plaintext token once — only its hash is ever stored, so this is the only place it exists in full. */
    async create(userId: string): Promise<{ token: string; expiresAt: string }> {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      await pool.query(
        'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
        [hashToken(token), userId, expiresAt],
      );
      return { token, expiresAt: expiresAt.toISOString() };
    },

    /** Role is joined fresh from `users` on every call, not denormalized onto the session row, so a role change takes effect immediately. */
    async findByToken(token: string): Promise<AuthenticatedSession | undefined> {
      const result = await pool.query<Row>(
        `SELECT s.user_id, u.email, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
        [hashToken(token)],
      );
      const row = result.rows[0];
      return row ? { userId: row.user_id, email: row.email, role: row.role } : undefined;
    },
  };
}

export type SessionsRepo = ReturnType<typeof createSessionsRepo>;
