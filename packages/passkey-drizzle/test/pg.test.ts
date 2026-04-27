/**
 * Integration tests for the Postgres passkey-drizzle adapter against a real
 * Postgres instance spun up via testcontainers. Exercises all CRUD
 * operations plus the null-fallback branches in rowToRecord.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { createPasskeyAdapter, createPasskeyTables } from '../src/pg/index.js';

const users = pgTable('app_users', { id: text('id').primaryKey() });
const built = createPasskeyTables({ usersTable: users });

let container: StartedPostgreSqlContainer;
let pool: Pool;
let db: NodePgDatabase;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  db = drizzle(pool);
  await db.execute(sql.raw(`
    create table app_users (
      id text primary key
    );
    create table holeauth_passkey_credential (
      id text primary key,
      user_id text not null references app_users(id) on delete cascade,
      credential_id text not null unique,
      public_key text not null,
      counter integer not null default 0,
      transports text[],
      device_name text,
      created_at timestamptz not null default now()
    );
    insert into app_users (id) values ('u1'), ('u2');
  `));
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('passkey-drizzle (pg) — schema builders', () => {
  it('exposes the passkeys table + relation', () => {
    expect(built.tables.passkeys).toBeDefined();
    expect(built.relations.passkeysRelations).toBeDefined();
  });

  it('honours a custom prefix', () => {
    const c = createPasskeyTables({ usersTable: users, prefix: 'zz_' });
    expect(c.tables.passkeys).toBeDefined();
  });
});

describe('passkey-drizzle (pg) — adapter CRUD', () => {
  const adapter = () => createPasskeyAdapter({ db, tables: built.tables });

  it('list returns an empty array when the user has no credentials', async () => {
    expect(await adapter().list('u1')).toEqual([]);
  });

  it('getByCredentialId returns null when no row matches', async () => {
    expect(await adapter().getByCredentialId('nope')).toBeNull();
  });

  it('create inserts a credential with a generated id', async () => {
    const rec = await adapter().create({
      userId: 'u1',
      credentialId: 'cred-1',
      publicKey: 'pk-1',
      counter: 0,
      transports: ['usb', 'nfc'],
      deviceName: 'YubiKey',
    });
    expect(rec.id).toBeTruthy();
    expect(rec.userId).toBe('u1');
    expect(rec.credentialId).toBe('cred-1');
    expect(rec.publicKey).toBe('pk-1');
    expect(rec.counter).toBe(0);
    expect(rec.transports).toEqual(['usb', 'nfc']);
    expect(rec.deviceName).toBe('YubiKey');
    expect(rec.createdAt).toBeInstanceOf(Date);
  });

  it('create uses a custom generateId when provided', async () => {
    const a = createPasskeyAdapter({
      db,
      tables: built.tables,
      generateId: () => 'custom-id-1',
    });
    const rec = await a.create({
      userId: 'u2',
      credentialId: 'cred-2',
      publicKey: 'pk-2',
      counter: 5,
      transports: null,
      deviceName: null,
    });
    expect(rec.id).toBe('custom-id-1');
    expect(rec.transports).toBeNull();
    expect(rec.deviceName).toBeNull();
  });

  it('list returns all credentials for the user', async () => {
    const list = await adapter().list('u1');
    expect(list).toHaveLength(1);
    expect(list[0]!.credentialId).toBe('cred-1');
  });

  it('getByCredentialId returns the matching record', async () => {
    const rec = await adapter().getByCredentialId('cred-1');
    expect(rec?.userId).toBe('u1');
  });

  it('updateCounter persists the new counter value', async () => {
    await adapter().updateCounter('cred-1', 42);
    const rec = await adapter().getByCredentialId('cred-1');
    expect(rec?.counter).toBe(42);
  });

  it('updateCounter on a missing credential is a no-op', async () => {
    await expect(adapter().updateCounter('ghost-cred', 99)).resolves.toBeUndefined();
  });

  it('delete removes the credential', async () => {
    const rec = await adapter().getByCredentialId('cred-1');
    await adapter().delete(rec!.id);
    expect(await adapter().getByCredentialId('cred-1')).toBeNull();
  });

  it('delete on a missing id is a no-op', async () => {
    await expect(adapter().delete('ghost-id')).resolves.toBeUndefined();
  });

  it('rowToRecord falls back to null for missing transports/deviceName', async () => {
    await db.execute(sql.raw(`
      insert into holeauth_passkey_credential (id, user_id, credential_id, public_key, counter)
      values ('probe-id', 'u2', 'cred-probe', 'pk', 0);
    `));
    const rec = await adapter().getByCredentialId('cred-probe');
    expect(rec?.transports).toBeNull();
    expect(rec?.deviceName).toBeNull();
  });
});
