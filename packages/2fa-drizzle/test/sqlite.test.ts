/**
 * Integration tests for the SQLite 2fa-drizzle adapter. Uses an in-memory
 * better-sqlite3 database — no container needed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

import {
  createTwoFactorAdapter,
  createTwoFactorTables,
} from '../src/sqlite/index.js';

const users = sqliteTable('app_users', { id: text('id').primaryKey() });
const built = createTwoFactorTables({ usersTable: users });

let sqlite: Database.Database;
let db: BetterSQLite3Database;

beforeAll(() => {
  sqlite = new Database(':memory:');
  db = drizzle(sqlite);
  db.run(sql.raw(`pragma foreign_keys = on;`));
  db.run(sql.raw(`
    create table app_users (id text primary key);
  `));
  db.run(sql.raw(`
    create table holeauth_2fa_credential (
      user_id text primary key references app_users(id) on delete cascade,
      secret text not null,
      enabled integer not null default 0,
      recovery_codes text not null default '[]',
      created_at integer not null,
      updated_at integer not null
    );
  `));
  db.run(sql.raw(`insert into app_users (id) values ('u1'), ('u2');`));
});

afterAll(() => {
  sqlite?.close();
});

describe('2fa-drizzle (sqlite) — schema builders', () => {
  it('exposes the twoFactor table and relation', () => {
    expect(built.tables.twoFactor).toBeDefined();
    expect(built.relations.twoFactorRelations).toBeDefined();
  });

  it('custom prefix is honoured', () => {
    const c = createTwoFactorTables({ usersTable: users, prefix: 'zz_' });
    expect(c.tables.twoFactor).toBeDefined();
  });
});

describe('2fa-drizzle (sqlite) — adapter CRUD', () => {
  const adapter = () => createTwoFactorAdapter({ db, tables: built.tables });

  it('getByUserId returns null for an unknown user', async () => {
    expect(await adapter().getByUserId('nobody')).toBeNull();
  });

  it('upsert inserts on conflict-do-update', async () => {
    const a = await adapter().upsert({
      userId: 'u1',
      secret: 'S1',
      enabled: false,
      recoveryCodes: ['x'],
    });
    expect(a.secret).toBe('S1');
    const b = await adapter().upsert({
      userId: 'u1',
      secret: 'S2',
      enabled: true,
      recoveryCodes: ['y', 'z'],
    });
    expect(b.secret).toBe('S2');
    expect(b.enabled).toBe(true);
    expect(b.recoveryCodes).toEqual(['y', 'z']);
  });

  it('update returns the patched record', async () => {
    const rec = await adapter().update('u1', { enabled: false });
    expect(rec?.enabled).toBe(false);
  });

  it('update ignores a userId in the patch', async () => {
    const rec = await adapter().update('u1', {
      userId: 'u2',
      recoveryCodes: ['a'],
    } as unknown as Parameters<ReturnType<typeof adapter>['update']>[1]);
    expect(rec?.userId).toBe('u1');
    expect(rec?.recoveryCodes).toEqual(['a']);
  });

  it('update returns null when no row matches', async () => {
    expect(await adapter().update('ghost', { enabled: true })).toBeNull();
  });

  it('delete removes the row', async () => {
    await adapter().delete('u1');
    expect(await adapter().getByUserId('u1')).toBeNull();
  });

  it('delete on missing row is a no-op', async () => {
    await expect(adapter().delete('ghost')).resolves.toBeUndefined();
  });

  it('rowToRecord null-coalesces recovery_codes when NULL', async () => {
    // Recreate the row-level table without the NOT NULL to exercise the
    // defensive branch. (SQLite cannot drop a NOT NULL in place.)
    db.run(sql.raw(`drop table holeauth_2fa_credential;`));
    db.run(sql.raw(`
      create table holeauth_2fa_credential (
        user_id text primary key references app_users(id) on delete cascade,
        secret text not null,
        enabled integer not null default 0,
        recovery_codes text,
        created_at integer not null,
        updated_at integer not null
      );
    `));
    db.run(sql.raw(`insert into holeauth_2fa_credential (user_id, secret, enabled, recovery_codes, created_at, updated_at) values ('u2', 'S', 0, NULL, ${Date.now()}, ${Date.now()});`));
    const got = await adapter().getByUserId('u2');
    expect(got?.recoveryCodes).toEqual([]);
  });
});
