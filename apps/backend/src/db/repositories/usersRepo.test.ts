import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../migrate.js';
import { createPool } from '../pool.js';
import { createUsersRepo } from './usersRepo.js';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://provenance_streams:provenance_streams@localhost:5432/provenance_streams';

const pool = createPool(DATABASE_URL);
const repo = createUsersRepo(pool);

beforeAll(async () => {
  await runMigrations(pool);
  // Guards against leftover rows from manual/dev-server testing against
  // this same local database, outside this test run.
  await pool.query('TRUNCATE sessions, users');
});

afterEach(async () => {
  await pool.query('TRUNCATE sessions, users');
});

afterAll(async () => {
  await pool.end();
});

describe('usersRepo', () => {
  it('creates a new user on first upsert', async () => {
    const user = await repo.upsert('auditor@example.com', 'auditor');
    expect(user.email).toBe('auditor@example.com');
    expect(user.role).toBe('auditor');
  });

  it('reuses the same row on a repeat upsert with the same role, not a duplicate', async () => {
    const first = await repo.upsert('auditor@example.com', 'auditor');
    const second = await repo.upsert('auditor@example.com', 'auditor');

    expect(second.id).toBe(first.id);
    const count = await pool.query<{ count: number }>('SELECT count(*)::int AS count FROM users');
    expect(count.rows[0]?.count).toBe(1);
  });

  it('a later upsert with a different role overwrites the role on the same row', async () => {
    const first = await repo.upsert('someone@example.com', 'auditor');
    const second = await repo.upsert('someone@example.com', 'supplier');

    expect(second.id).toBe(first.id);
    expect(second.role).toBe('supplier');
  });
});
