/**
 * Integration tests for the MySQL rbac-drizzle adapter against a real
 * MySQL instance spun up via testcontainers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { mysqlTable, varchar } from 'drizzle-orm/mysql-core';

import { createRbacAdapter, createRbacTables } from '../src/mysql/index.js';

const users = mysqlTable('app_users', {
  id: varchar('id', { length: 191 }).primaryKey(),
});
const built = createRbacTables({ usersTable: users });

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
    create table holeauth_rbac_user_group (
      user_id varchar(191) not null,
      group_id varchar(191) not null,
      assigned_at timestamp(3) not null default current_timestamp(3),
      primary key (user_id, group_id),
      key holeauth_rbac_user_group_group_idx (group_id),
      constraint fk_rbac_ug_user foreign key (user_id) references app_users(id) on delete cascade
    );
    create table holeauth_rbac_user_permission (
      user_id varchar(191) not null,
      node varchar(191) not null,
      assigned_at timestamp(3) not null default current_timestamp(3),
      primary key (user_id, node),
      constraint fk_rbac_up_user foreign key (user_id) references app_users(id) on delete cascade
    );
    insert into app_users (id) values ('u1'), ('u2');
  `);
}, 300_000);

afterAll(async () => {
  await conn?.end();
  await container?.stop();
});

describe('rbac-drizzle (mysql) — schema builders', () => {
  it('exposes tables + relations', () => {
    expect(built.tables.userGroups).toBeDefined();
    expect(built.tables.userPermissions).toBeDefined();
    expect(built.relations.userGroupsRelations).toBeDefined();
    expect(built.relations.userPermissionsRelations).toBeDefined();
  });

  it('persistGroups: true adds a groups table', () => {
    const c = createRbacTables({ usersTable: users, persistGroups: true });
    expect(c.tables.groups).toBeDefined();
  });

  it('custom prefix honoured', () => {
    const c = createRbacTables({ usersTable: users, prefix: 'zz_' });
    expect(c.tables.userGroups).toBeDefined();
  });
});

describe('rbac-drizzle (mysql) — adapter CRUD', () => {
  const adapter = () => createRbacAdapter({ db, tables: built.tables });

  it('listUserGroups empty for new user', async () => {
    expect(await adapter().listUserGroups('u1')).toEqual([]);
  });

  it('assignGroup inserts + is idempotent via onDuplicateKeyUpdate', async () => {
    await adapter().assignGroup('u1', 'admins');
    await adapter().assignGroup('u1', 'admins');
    expect(await adapter().listUserGroups('u1')).toEqual(['admins']);
  });

  it('multiple groups per user', async () => {
    await adapter().assignGroup('u1', 'editors');
    const groups = (await adapter().listUserGroups('u1')).sort();
    expect(groups).toEqual(['admins', 'editors']);
  });

  it('removeGroup + no-op on missing', async () => {
    await adapter().removeGroup('u1', 'editors');
    expect(await adapter().listUserGroups('u1')).toEqual(['admins']);
    await expect(adapter().removeGroup('u1', 'ghost')).resolves.toBeUndefined();
  });

  it('grantPermission + idempotent', async () => {
    await adapter().grantPermission('u1', 'posts.read');
    await adapter().grantPermission('u1', 'posts.read');
    expect(await adapter().listUserPermissions('u1')).toEqual(['posts.read']);
  });

  it('revokePermission + no-op on missing', async () => {
    await adapter().grantPermission('u1', 'posts.write');
    await adapter().revokePermission('u1', 'posts.write');
    expect(await adapter().listUserPermissions('u1')).toEqual(['posts.read']);
    await expect(adapter().revokePermission('u1', 'ghost')).resolves.toBeUndefined();
  });

  it('listAllGroupAssignments returns everything', async () => {
    await adapter().assignGroup('u2', 'editors');
    const all = await adapter().listAllGroupAssignments();
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const row of all) {
      expect(row.assignedAt).toBeInstanceOf(Date);
    }
  });

  it('purgeUser removes everything for that user', async () => {
    await adapter().grantPermission('u2', 'posts.read');
    await adapter().purgeUser('u2');
    expect(await adapter().listUserGroups('u2')).toEqual([]);
    expect(await adapter().listUserPermissions('u2')).toEqual([]);
    await expect(adapter().purgeUser('ghost')).resolves.toBeUndefined();
  });
});
