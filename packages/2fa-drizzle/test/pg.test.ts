/**
 * Integration tests for the Postgres 2fa-drizzle adapter against a real
 * Postgres instance spun up via testcontainers. Exercises every CRUD
 * branch including the `update(...)` returning-null path when no row
 * matches, and the `upsert` ON CONFLICT branch.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import {
  createTwoFactorAdapter,
  createTwoFactorTables,
} from '../src/pg/index.js';

const users = pgTable('app_users', { id: text('id').primaryKey() });
const built = createTwoFactorTables({ usersTable: users });
const { twoFactor } = built.tables;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let db: NodePgDatabase;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  db = drizzle(pool);
  // Provision schema. Mirrors the generated migrations (which is what
  // consumers would normally use drizzle-kit for).
  await db.execute(sql.raw(`
    create table if not exists app_users (
      id text primary key
    );
    create table if not exists holeauth_2fa_credential (
      user_id text primary key references app_users(id) on delete cascade,
      secret text not null,
      enabled boolean not null default false,
      recovery_codes text[] not null default '{}'::text[],
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `));
  await db.execute(sql.raw(`insert into app_users (id) values ('u1'), ('u2') on conflict do nothing;`));
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('2fa-drizzle (pg) — schema builders', () => {
  it('exposes the twoFactor table + relation', () => {
    expect(twoFactor).toBeDefined();
    expect(built.relations.twoFactorRelations).toBeDefined();
  });

  it('honours custom prefix', () => {
    const customized = createTwoFactorTables({ usersTable: users, prefix: 'x_' });
    expect(customized.tables.twoFactor).toBeDefined();
  });
});

describe('2fa-drizzle (pg) — adapter CRUD', () => {
  const adapter = () => createTwoFactorAdapter({ db, tables: built.tables });

  it('getByUserId returns null when no row exists', async () => {
    expect(await adapter().getByUserId('u1')).toBeNull();
  });

  it('upsert inserts a fresh record', async () => {
    const rec = await adapter().upsert({
      userId: 'u1',
      secret: 'SECRET-1',
      enabled: false,
      recoveryCodes: ['C1', 'C2'],
    });
    expect(rec.userId).toBe('u1');
    expect(rec.secret).toBe('SECRET-1');
    expect(rec.enabled).toBe(false);
    expect(rec.recoveryCodes).toEqual(['C1', 'C2']);
    expect(rec.createdAt).toBeInstanceOf(Date);
  });

  it('getByUserId returns the inserted row', async () => {
    const got = await adapter().getByUserId('u1');
    expect(got?.secret).toBe('SECRET-1');
  });

  it('upsert triggers ON CONFLICT branch and overwrites', async () => {
    const rec = await adapter().upsert({
      userId: 'u1',
      secret: 'SECRET-2',
      enabled: true,
      recoveryCodes: ['R1'],
    });
    expect(rec.secret).toBe('SECRET-2');
    expect(rec.enabled).toBe(true);
    expect(rec.recoveryCodes).toEqual(['R1']);
  });

  it('update patches a subset of fields and returns the new record', async () => {
    const rec = await adapter().update('u1', {
      enabled: false,
      recoveryCodes: ['R2', 'R3'],
    });
    expect(rec?.enabled).toBe(false);
    expect(rec?.recoveryCodes).toEqual(['R2', 'R3']);
  });

  it('update ignores userId in the patch (cannot change PK)', async () => {
    const rec = await adapter().update('u1', {
      userId: 'u2',
      enabled: true,
    } as unknown as Parameters<ReturnType<typeof adapter>['update']>[1]);
    // The row for u1 is updated, not u2
    expect(rec?.userId).toBe('u1');
    expect(rec?.enabled).toBe(true);
  });

  it('update returns null when no row matches', async () => {
    const rec = await adapter().update('ghost', { enabled: true });
    expect(rec).toBeNull();
  });

  it('delete removes the record', async () => {
    await adapter().delete('u1');
    expect(await adapter().getByUserId('u1')).toBeNull();
  });

  it('delete on a missing row is a no-op', async () => {
    await expect(adapter().delete('ghost')).resolves.toBeUndefined();
  });

  it('preserves an empty recoveryCodes default when upserting with []', async () => {
    const rec = await adapter().upsert({
      userId: 'u2',
      secret: 'S',
      enabled: false,
      recoveryCodes: [],
    });
    expect(rec.recoveryCodes).toEqual([]);
  });

  it('rowToRecord falls back to [] when recovery_codes column is null', async () => {
    // Relax the NOT NULL constraint for this probe — we want to exercise
    // the defensive null-coalescing branch in rowToRecord.
    await db.execute(sql.raw(`delete from holeauth_2fa_credential where user_id = 'u2';`));
    await db.execute(sql.raw(`alter table holeauth_2fa_credential alter column recovery_codes drop not null;`));
    await db.execute(sql.raw(`insert into holeauth_2fa_credential (user_id, secret, enabled, recovery_codes) values ('u2', 'S', false, null);`));
    const got = await adapter().getByUserId('u2');
    expect(got?.recoveryCodes).toEqual([]);
  });
});
