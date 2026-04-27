/**
 * Integration tests for the MySQL passkey-drizzle adapter against a real
 * MySQL instance spun up via testcontainers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';

import { createPasskeyAdapter, createPasskeyTables } from '../src/mysql/index.js';

const users = mysqlTable('app_users', {
  id: varchar('id', { length: 191 }).primaryKey(),
});
const built = createPasskeyTables({ usersTable: users });

let container: StartedMySqlContainer;
let conn: mysql.Connection;
let db: MySql2Database;

beforeAll(async () => {
  container = await new MySqlContainer('mysql:8.0').start();
  conn = await mysql.createConnection({
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getUserPassword(),
    database: container.getDatabase(),
    multipleStatements: true,
  });
  db = drizzle(conn);
  await conn.query(`
    create table app_users (
      id varchar(191) primary key
    );
    create table holeauth_passkey_credential (
      id varchar(191) primary key,
      user_id varchar(191) not null,
      credential_id varchar(512) not null,
      public_key text not null,
      counter int not null default 0,
      transports json,
      device_name varchar(191),
      created_at timestamp(3) not null default current_timestamp(3),
      unique key cred_idx (credential_id),
      key user_idx (user_id),
      constraint fk_passkey_user foreign key (user_id) references app_users(id) on delete cascade
    );
    insert into app_users (id) values ('u1'), ('u2');
  `);
}, 300_000);

afterAll(async () => {
  await conn?.end();
  await container?.stop();
});

describe('passkey-drizzle (mysql) — schema builders', () => {
  it('exposes the passkeys table + relation', () => {
    expect(built.tables.passkeys).toBeDefined();
    expect(built.relations.passkeysRelations).toBeDefined();
  });

  it('honours a custom prefix', () => {
    const c = createPasskeyTables({ usersTable: users, prefix: 'zz_' });
    expect(c.tables.passkeys).toBeDefined();
  });
});

describe('passkey-drizzle (mysql) — adapter CRUD', () => {
  const adapter = () => createPasskeyAdapter({ db, tables: built.tables });

  it('list returns empty when the user has no credentials', async () => {
    expect(await adapter().list('u1')).toEqual([]);
  });

  it('getByCredentialId returns null when none match', async () => {
    expect(await adapter().getByCredentialId('none')).toBeNull();
  });

  it('create inserts and re-selects the row (mysql uses no returning())', async () => {
    const rec = await adapter().create({
      userId: 'u1',
      credentialId: 'cred-1',
      publicKey: 'pk-1',
      counter: 3,
      transports: ['usb'],
      deviceName: 'Phone',
    });
    expect(rec.id).toBeTruthy();
    expect(rec.credentialId).toBe('cred-1');
    expect(rec.counter).toBe(3);
    expect(rec.transports).toEqual(['usb']);
    expect(rec.deviceName).toBe('Phone');
  });

  it('create uses a custom generateId', async () => {
    const a = createPasskeyAdapter({
      db,
      tables: built.tables,
      generateId: () => 'custom-mysql-id',
    });
    const rec = await a.create({
      userId: 'u2',
      credentialId: 'cred-2',
      publicKey: 'pk-2',
      counter: 0,
      transports: null,
      deviceName: null,
    });
    expect(rec.id).toBe('custom-mysql-id');
    expect(rec.transports).toBeNull();
    expect(rec.deviceName).toBeNull();
  });

  it('list returns all credentials for a user', async () => {
    const list = await adapter().list('u1');
    expect(list).toHaveLength(1);
  });

  it('getByCredentialId returns a match', async () => {
    const rec = await adapter().getByCredentialId('cred-1');
    expect(rec?.userId).toBe('u1');
  });

  it('updateCounter persists a new value', async () => {
    await adapter().updateCounter('cred-1', 99);
    const rec = await adapter().getByCredentialId('cred-1');
    expect(rec?.counter).toBe(99);
  });

  it('updateCounter on a missing credential is a no-op', async () => {
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
    await conn.query(
      `insert into holeauth_passkey_credential (id, user_id, credential_id, public_key, counter) values ('probe-id', 'u2', 'cred-probe', 'pk', 0);`,
    );
    const rec = await adapter().getByCredentialId('cred-probe');
    expect(rec?.transports).toBeNull();
    expect(rec?.deviceName).toBeNull();
  });
});
