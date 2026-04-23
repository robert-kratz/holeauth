import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema';

const url =
  process.env.DATABASE_URL ?? 'postgres://holeauth:holeauth@localhost:54329/holeauth';

declare global {
  // eslint-disable-next-line no-var
  var __holeauth_pg_pool: Pool | undefined;
}

export const pool = globalThis.__holeauth_pg_pool ?? new Pool({ connectionString: url });
if (!globalThis.__holeauth_pg_pool) globalThis.__holeauth_pg_pool = pool;

export const db = drizzle(pool, { schema });
