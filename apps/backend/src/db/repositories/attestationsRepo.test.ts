import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../migrate.js';
import { createPool } from '../pool.js';
import { createAttestationsRepo } from './attestationsRepo.js';
import type { AttestationRecord } from './attestationsRepo.js';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://provenance_streams:provenance_streams@localhost:5432/provenance_streams';

const pool = createPool(DATABASE_URL);
const repo = createAttestationsRepo(pool);

function makeRecord(overrides: Partial<AttestationRecord> = {}): AttestationRecord {
  return {
    id: '1',
    supplier: '0xef16CE280c76295DbE269175fB823B168904EB37',
    auditor: '0x0a782425A66dA23f49eEDBC79d633430CF7307D2',
    policyId: '1',
    observedAt: '2026-08-01T00:00:00.000Z',
    transactionHash: '0xb8130e99e338d1cc557f03f648b626d3dfe2d661dad2e2bd23e05635faeb3fb7',
    ...overrides,
  };
}

beforeAll(async () => {
  await runMigrations(pool);
  // Guards against leftover rows from manual/dev-server testing against
  // this same local database, outside this test run.
  await pool.query('TRUNCATE attestations');
});

afterEach(async () => {
  await pool.query('TRUNCATE attestations');
});

afterAll(async () => {
  await pool.end();
});

describe('attestationsRepo', () => {
  it('inserts a new record and reports it as new', async () => {
    const wasNew = await repo.insertIfNew(makeRecord());
    expect(wasNew).toBe(true);

    const [record] = await repo.list();
    expect(record?.id).toBe('1');
    expect(record?.supplier).toBe('0xef16CE280c76295DbE269175fB823B168904EB37');
  });

  it('is idempotent by id — the live watcher and HistoryService backfill can both observe the same attestation', async () => {
    await repo.insertIfNew(makeRecord());
    const wasNewAgain = await repo.insertIfNew(makeRecord());

    expect(wasNewAgain).toBe(false);
    expect(await repo.list()).toHaveLength(1);
  });

  it('lists newest-first', async () => {
    await repo.insertIfNew(makeRecord({ id: '1', observedAt: '2026-08-01T00:00:00.000Z' }));
    await repo.insertIfNew(makeRecord({ id: '2', observedAt: '2026-08-02T00:00:00.000Z' }));
    await repo.insertIfNew(makeRecord({ id: '3', observedAt: '2026-08-01T12:00:00.000Z' }));

    const ids = (await repo.list()).map((record) => record.id);
    expect(ids).toEqual(['2', '3', '1']);
  });
});
