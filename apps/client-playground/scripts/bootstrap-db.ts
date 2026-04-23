#!/usr/bin/env node
/**
 * Ensure the `client_playground` database exists on the shared Postgres
 * instance spun up by the main playground's docker-compose. Connects to the
 * default `postgres` database and `CREATE DATABASE`s on demand.
 */
import pg from 'pg';

const url =
  process.env.DATABASE_URL ??
  'postgres://holeauth:holeauth@localhost:54329/client_playground';

async function main() {
  const u = new URL(url);
  const targetDb = u.pathname.replace(/^\//, '') || 'client_playground';
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const r = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
    if (r.rowCount === 0) {
      // CREATE DATABASE cannot be parameterized; the name came from our own URL.
      await client.query(`CREATE DATABASE "${targetDb.replace(/"/g, '""')}"`);
      console.log(`[client-playground] created database ${targetDb}`);
    } else {
      console.log(`[client-playground] database ${targetDb} already exists`);
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('[client-playground] db bootstrap failed:', e);
  process.exit(1);
});
