/**
 * Integration tests for the MySQL 2fa-drizzle adapter against a real
 * MySQL instance spun up via testcontainers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

import {
  createTwoFactorAdapter,
  createTwoFactorTables,
} from '../src/mysql/index.js';

const users = mysqlTable('app_users', {
  id: varchar('id', { length: 191 }).primaryKey(),
});
const built = createTwoFactorTables({ usersTable: users });

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
    create table holeauth_2fa_credential (
      user_id varchar(191) primary key,
      secret varchar(191) not null,
      enabled boolean not null default false,
      recovery_codes json not null,
      created_at timestamp(3) not null default current_timestamp(3),
      updated_at timestamp(3) not null default current_timestamp(3),
      constraint fk_user foreign key (user_id) references app_users(id) on delete cascade
    );
    insert into app_users (id) values ('u1'), ('u2');
  `);
}, 180_000);

afterAll(async () => {
  await conn?.end();
  await container?.stop();
});

describe('2fa-drizzle (mysql) — schema builders', () => {
  it('exposes the twoFactor table + relation', () => {
    expect(built.tables.twoFactor).toBeDefined();
    expect(built.relations.twoFactorRelations).toBeDefined();
  });
  it('custom prefix is honoured', () => {
    const c = createTwoFactorTables({ usersTable: users, prefix: 'zz_' });
    expect(c.tables.twoFactor).toBeDefined();
  });
});

describe('2fa-drizzle (mysql) — adapter CRUD', () => {
  const adapter = () => createTwoFactorAdapter({ db, tables: built.tables });

  it('getByUserId returns null for an unknown user', async () => {
    expect(await adapter().getByUserId('nobody')).toBeNull();
  });

  it('upsert inserts a fresh record', async () => {
    const rec = await adapter().upsert({
      userId: 'u1',
      secret: 'S1',
      enabled: false,
      recoveryCodes: ['C1'],
    });
    expect(rec.secret).toBe('S1');
    expect(rec.enabled).toBe(false);
  });

  it('upsert hits ON DUPLICATE KEY branch on re-insert', async () => {
    const rec = await adapter().upsert({
      userId: 'u1',
      secret: 'S2',
      enabled: true,
      recoveryCodes: ['R1'],
    });
    expect(rec.secret).toBe('S2');
    expect(rec.enabled).toBe(true);
  });

  it('update patches a subset of fields', async () => {
    const rec = await adapter().update('u1', { enabled: false });
    expect(rec?.enabled).toBe(false);
  });

  it('update strips userId from the patch', async () => {
    const rec = await adapter().update('u1', {
      userId: 'u2',
      recoveryCodes: ['a'],
    } as unknown as Parameters<ReturnType<typeof adapter>['update']>[1]);
    expect(rec?.userId).toBe('u1');
  });

  it('update returns null when no row matches', async () => {
    expect(await adapter().update('ghost', { enabled: true })).toBeNull();
  });

  it('delete removes the row; delete on missing is a no-op', async () => {
    await adapter().delete('u1');
    expect(await adapter().getByUserId('u1')).toBeNull();
    await expect(adapter().delete('ghost')).resolves.toBeUndefined();
  });

  it('rowToRecord tolerates null recovery_codes (hand-inserted)', async () => {
    // MySQL json column rejects NULL without constraint change; use NULL-able copy for coverage.
    await conn.query(`alter table holeauth_2fa_credential modify column recovery_codes json null;`);
    await conn.query(
      `insert into holeauth_2fa_credential (user_id, secret, enabled, recovery_codes) values ('u2', 'S', false, null);`,
    );
    const got = await adapter().getByUserId('u2');
    expect(got?.recoveryCodes).toEqual([]);
  });
});
