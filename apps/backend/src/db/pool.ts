import { Pool } from 'pg';

/** One pool per process — every repository imports this instead of constructing its own. */
export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}
