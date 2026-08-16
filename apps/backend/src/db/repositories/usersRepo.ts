import type { Pool } from 'pg';

export type Role = 'admin' | 'auditor' | 'supplier';

export interface User {
  id: string;
  email: string;
  role: Role;
  emailVerifiedAt: string | undefined;
}

interface Row {
  id: string;
  email: string;
  role: Role;
  email_verified_at: Date | null;
}

function toUser(row: Row): User {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerifiedAt: row.email_verified_at?.toISOString(),
  };
}

export function createUsersRepo(pool: Pool) {
  return {
    /**
     * A role change on re-login just overwrites the row — no stronger
     * identity guarantee than today's unverified-email login already has
     * (see docs/decisions.md). `verified: true` (only ever passed by `POST
     * /api/auth/email/complete`, after independently confirming a real OTP
     * login with Circle) stamps `email_verified_at`; any other caller
     * upserting the same row again leaves an existing timestamp untouched
     * rather than clearing it.
     */
    async upsert(email: string, role: Role, verified = false): Promise<User> {
      const result = await pool.query<Row>(
        `INSERT INTO users (email, role, email_verified_at)
         VALUES ($1, $2, CASE WHEN $3 THEN now() END)
         ON CONFLICT (email) DO UPDATE SET
           role = EXCLUDED.role,
           email_verified_at = CASE WHEN $3 THEN now() ELSE users.email_verified_at END
         RETURNING *`,
        [email, role, verified],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('Failed to upsert user.');
      }
      return toUser(row);
    },
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
