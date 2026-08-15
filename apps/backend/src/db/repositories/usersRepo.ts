import type { Pool } from 'pg';

export type Role = 'admin' | 'auditor' | 'supplier';

export interface User {
  id: string;
  email: string;
  role: Role;
}

interface Row {
  id: string;
  email: string;
  role: Role;
}

function toUser(row: Row): User {
  return { id: row.id, email: row.email, role: row.role };
}

export function createUsersRepo(pool: Pool) {
  return {
    /** A role change on re-login just overwrites the row — no stronger identity guarantee than today's unverified-email login already has (see docs/decisions.md). */
    async upsert(email: string, role: Role): Promise<User> {
      const result = await pool.query<Row>(
        `INSERT INTO users (email, role)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
         RETURNING *`,
        [email, role],
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
