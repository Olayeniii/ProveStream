import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Pool } from 'pg';

const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', '..', 'migrations');

/**
 * Applies every `migrations/*.sql` file not yet recorded in `schema_migrations`,
 * in filename order (numeric prefix), each inside its own transaction. Render's
 * build command is `npm install`, not a build/predeploy step, so there's no CI
 * hook to run migrations from — this runs once at process boot instead.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const applied = new Set(
    (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
      (row) => row.name,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
