#!/usr/bin/env tsx
/**
 * Bootstraps the IdP signing key + seeds a `developer` group assignment
 * for the regular seed user so they can create OAuth apps immediately.
 *
 * Run with: pnpm --filter playground idp:init
 * Idempotent.
 */
import { auth } from '../lib/auth.js';
import { db, pool } from '../db/client.js';
import { userGroups } from '../db/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('⏳  Ensuring IdP signing key…');
  const key = await auth.idp.keys.bootstrap();
  console.log(`   kid=${key.kid} alg=${key.alg} active=${key.active}`);

  console.log('⏳  Adding seed user to developer group…');
  const sqlTag = sql;
  const DEVELOPER_USERS = ['seed-user-reg', 'seed-user-mod'];
  for (const userId of DEVELOPER_USERS) {
    try {
      await db
        .insert(userGroups)
        .values({ userId, groupId: 'developer' })
        .onConflictDoNothing();
      console.log(`   added ${userId} → developer`);
    } catch (e) {
      // user may not exist yet
      console.log(`   skipped ${userId}: ${e instanceof Error ? e.message : e}`);
    }
  }
  void sqlTag;
  console.log('✅  IdP init complete.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
