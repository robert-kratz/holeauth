import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const url =
  process.env.DATABASE_URL ??
  'postgres://holeauth:holeauth@localhost:54329/client_playground';

export const pool = new pg.Pool({ connectionString: url });
export const db = drizzle(pool, { schema });
