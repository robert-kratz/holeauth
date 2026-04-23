#!/usr/bin/env tsx
/**
 * Database seeder for the playground.
 *
 * Creates three default users and assigns them to RBAC groups:
 *   admin@example.com   / Password1!   → admin group
 *   mod@example.com     / Password1!   → moderator group
 *   user@example.com    / Password1!   → user group (default)
 *
 * Run with: pnpm --filter playground db:seed
 * Idempotent — existing users are skipped via ON CONFLICT DO NOTHING.
 */

import { hash } from '@holeauth/core/password';
import { db, pool } from '../db/client.js';
import { users, userGroups } from '../db/schema.js';
import { sql } from 'drizzle-orm';

const SEED_USERS = [
  { id: 'seed-user-admin', email: 'admin@example.com', name: 'Admin User',  group: 'admin'     },
  { id: 'seed-user-mod',   email: 'mod@example.com',   name: 'Mod User',    group: 'moderator' },
  { id: 'seed-user-reg',   email: 'user@example.com',  name: 'Regular User', group: 'user'     },
] as const;

const DEFAULT_PASSWORD = 'Password1!';

async function main() {
  console.log('⏳  Hashing passwords…');
  const passwordHash = await hash(DEFAULT_PASSWORD);

  for (const u of SEED_USERS) {
    // Insert user — skip if email already taken
    await db
      .insert(users)
      .values({
        id:           u.id,
        email:        u.email,
        name:         u.name,
        passwordHash, // stored in password_hash column
      })
      .onConflictDoNothing();

    // Assign RBAC group — skip if already assigned
    await db
      .insert(userGroups)
      .values({ userId: u.id, groupId: u.group })
      .onConflictDoNothing();

    console.log(`✓  ${u.email}  →  ${u.group}`);
  }

  console.log('\n🌱  Seed complete. Default credentials:');
  console.log('   Email                 Password    Role');
  console.log('   ─────────────────────────────────────────');
  for (const u of SEED_USERS) {
    console.log(`   ${u.email.padEnd(22)}${DEFAULT_PASSWORD.padEnd(12)}${u.group}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
