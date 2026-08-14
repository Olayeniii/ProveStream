import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../migrate.js';
import { createPool } from '../pool.js';
import { createSessionsRepo } from './sessionsRepo.js';
import { createUsersRepo } from './usersRepo.js';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://provenance_streams:provenance_streams@localhost:5432/provenance_streams';

const pool = createPool(DATABASE_URL);
const usersRepo = createUsersRepo(pool);
const sessionsRepo = createSessionsRepo(pool);

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

describe('sessionsRepo', () => {
  it('resolves a freshly created session back to the correct user and role', async () => {
    const user = await usersRepo.upsert('auditor@example.com', 'auditor');
    const { token } = await sessionsRepo.create(user.id);

    const resolved = await sessionsRepo.findByToken(token);
    expect(resolved).toEqual({ userId: user.id, email: 'auditor@example.com', role: 'auditor' });
  });

  it('never stores the token in plaintext — only its hash is queryable', async () => {
    const user = await usersRepo.upsert('auditor@example.com', 'auditor');
    const { token } = await sessionsRepo.create(user.id);

    const stored = await pool.query<{ token_hash: string }>(
      'SELECT token_hash FROM sessions WHERE user_id = $1',
      [user.id],
    );
    expect(stored.rows[0]?.token_hash).not.toBe(token);
  });

  it('rejects an unknown token', async () => {
    const resolved = await sessionsRepo.findByToken('this-token-was-never-issued');
    expect(resolved).toBeUndefined();
  });

  it('rejects a revoked session', async () => {
    const user = await usersRepo.upsert('auditor@example.com', 'auditor');
    const { token } = await sessionsRepo.create(user.id);

    await pool.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1', [user.id]);

    expect(await sessionsRepo.findByToken(token)).toBeUndefined();
  });

  it('rejects an expired session', async () => {
    const user = await usersRepo.upsert('auditor@example.com', 'auditor');
    const { token } = await sessionsRepo.create(user.id);

    await pool.query(
      "UPDATE sessions SET expires_at = now() - interval '1 second' WHERE user_id = $1",
      [user.id],
    );

    expect(await sessionsRepo.findByToken(token)).toBeUndefined();
  });

  it('reflects a role change on the very next lookup, since role is joined fresh each time', async () => {
    const user = await usersRepo.upsert('auditor@example.com', 'auditor');
    const { token } = await sessionsRepo.create(user.id);

    await usersRepo.upsert('auditor@example.com', 'supplier');

    const resolved = await sessionsRepo.findByToken(token);
    expect(resolved?.role).toBe('supplier');
  });
});
