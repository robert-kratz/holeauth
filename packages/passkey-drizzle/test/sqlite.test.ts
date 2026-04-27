/**
 * Integration tests for the SQLite passkey-drizzle adapter using an
 * in-memory better-sqlite3 database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

import { createPasskeyAdapter, createPasskeyTables } from '../src/sqlite/index.js';

const users = sqliteTable('app_users', { id: text('id').primaryKey() });
const built = createPasskeyTables({ usersTable: users });

let sqlite: Database.Database;
let db: BetterSQLite3Database;

beforeAll(() => {
  sqlite = new Database(':memory:');
  db = drizzle(sqlite);
  sqlite.exec(`pragma foreign_keys = on;`);
  sqlite.exec(`
    create table app_users (id text primary key);
    create table holeauth_passkey_credential (
      id text primary key,
      user_id text not null references app_users(id) on delete cascade,
      credential_id text not null,
      public_key text not null,
      counter integer not null default 0,
      transports text,
      device_name text,
      created_at integer not null
    );
    create unique index holeauth_passkey_credential_cred_idx on holeauth_passkey_credential (credential_id);
    create index holeauth_passkey_credential_user_idx on holeauth_passkey_credential (user_id);
    insert into app_users (id) values ('u1'), ('u2');
  `);
});

afterAll(() => {
  sqlite?.close();
});

describe('passkey-drizzle (sqlite) — schema builders', () => {
  it('exposes the passkeys table + relation', () => {
    expect(built.tables.passkeys).toBeDefined();
    expect(built.relations.passkeysRelations).toBeDefined();
  });

  it('honours a custom prefix', () => {
    const c = createPasskeyTables({ usersTable: users, prefix: 'zz_' });
    expect(c.tables.passkeys).toBeDefined();
  });
});

describe('passkey-drizzle (sqlite) — adapter CRUD', () => {
  const adapter = () => createPasskeyAdapter({ db, tables: built.tables });

  it('list returns empty when there are no credentials', async () => {
    expect(await adapter().list('u1')).toEqual([]);
  });

  it('getByCredentialId returns null when missing', async () => {
    expect(await adapter().getByCredentialId('none')).toBeNull();
  });

  it('create inserts a new credential and returns the row', async () => {
    const rec = await adapter().create({
      userId: 'u1',
      credentialId: 'cred-1',
      publicKey: 'pk-1',
      counter: 0,
      transports: ['internal'],
      deviceName: 'Mac',
    });
    expect(rec.id).toBeTruthy();
    expect(rec.credentialId).toBe('cred-1');
    expect(rec.transports).toEqual(['internal']);
    expect(rec.deviceName).toBe('Mac');
  });

  it('create honours a custom generateId', async () => {
    const a = createPasskeyAdapter({
      db,
      tables: built.tables,
      generateId: () => 'custom-sqlite-id',
    });
    const rec = await a.create({
      userId: 'u2',
      credentialId: 'cred-2',
      publicKey: 'pk-2',
      counter: 7,
      transports: null,
      deviceName: null,
    });
    expect(rec.id).toBe('custom-sqlite-id');
    expect(rec.transports).toBeNull();
    expect(rec.deviceName).toBeNull();
  });

  it('list returns credentials for the user', async () => {
    const list = await adapter().list('u1');
    expect(list).toHaveLength(1);
  });

  it('getByCredentialId matches by credential_id', async () => {
    const rec = await adapter().getByCredentialId('cred-1');
    expect(rec?.userId).toBe('u1');
  });

  it('updateCounter updates the counter', async () => {
    await adapter().updateCounter('cred-1', 123);
    const rec = await adapter().getByCredentialId('cred-1');
    expect(rec?.counter).toBe(123);
  });

  it('updateCounter on missing credential is a no-op', async () => {
    await expect(adapter().updateCounter('ghost', 0)).resolves.toBeUndefined();
  });

  it('delete removes the row', async () => {
    const rec = await adapter().getByCredentialId('cred-1');
    await adapter().delete(rec!.id);
    expect(await adapter().getByCredentialId('cred-1')).toBeNull();
  });

  it('delete on missing id is a no-op', async () => {
    await expect(adapter().delete('ghost')).resolves.toBeUndefined();
  });

  it('rowToRecord falls back to null for missing transports/deviceName', async () => {
    db.run(sql.raw(`
      insert into holeauth_passkey_credential (id, user_id, credential_id, public_key, counter, created_at)
      values ('probe-id', 'u2', 'cred-probe', 'pk', 0, ${Date.now()});
    `));
    const rec = await adapter().getByCredentialId('cred-probe');
    expect(rec?.transports).toBeNull();
    expect(rec?.deviceName).toBeNull();
  });
});
