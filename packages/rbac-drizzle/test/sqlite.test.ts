/**
 * Integration tests for the SQLite rbac-drizzle adapter using an in-memory
 * better-sqlite3 database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { createRbacAdapter, createRbacTables } from '../src/sqlite/index.js';

const users = sqliteTable('app_users', { id: text('id').primaryKey() });
const built = createRbacTables({ usersTable: users });

let sqlite: Database.Database;
let db: BetterSQLite3Database;

beforeAll(() => {
  sqlite = new Database(':memory:');
  db = drizzle(sqlite);
  sqlite.exec(`pragma foreign_keys = on;`);
  sqlite.exec(`
    create table app_users (id text primary key);
    create table holeauth_rbac_user_group (
      user_id text not null references app_users(id) on delete cascade,
      group_id text not null,
      assigned_at integer not null,
      primary key (user_id, group_id)
    );
    create index holeauth_rbac_user_group_group_idx on holeauth_rbac_user_group (group_id);
    create table holeauth_rbac_user_permission (
      user_id text not null references app_users(id) on delete cascade,
      node text not null,
      assigned_at integer not null,
      primary key (user_id, node)
    );
    insert into app_users (id) values ('u1'), ('u2');
  `);
});

afterAll(() => {
  sqlite?.close();
});

describe('rbac-drizzle (sqlite) — schema builders', () => {
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

describe('rbac-drizzle (sqlite) — adapter CRUD', () => {
  const adapter = () => createRbacAdapter({ db, tables: built.tables });

  it('assignGroup + listUserGroups + idempotent on conflict', async () => {
    await adapter().assignGroup('u1', 'admins');
    await adapter().assignGroup('u1', 'admins');
    expect(await adapter().listUserGroups('u1')).toEqual(['admins']);
  });

  it('multiple groups per user', async () => {
    await adapter().assignGroup('u1', 'editors');
    expect((await adapter().listUserGroups('u1')).sort()).toEqual(['admins', 'editors']);
  });

  it('removeGroup + no-op', async () => {
    await adapter().removeGroup('u1', 'editors');
    expect(await adapter().listUserGroups('u1')).toEqual(['admins']);
    await expect(adapter().removeGroup('u1', 'ghost')).resolves.toBeUndefined();
  });

  it('grantPermission + idempotent', async () => {
    await adapter().grantPermission('u1', 'posts.read');
    await adapter().grantPermission('u1', 'posts.read');
    expect(await adapter().listUserPermissions('u1')).toEqual(['posts.read']);
  });

  it('revokePermission + no-op', async () => {
    await adapter().grantPermission('u1', 'posts.write');
    await adapter().revokePermission('u1', 'posts.write');
    expect(await adapter().listUserPermissions('u1')).toEqual(['posts.read']);
    await expect(adapter().revokePermission('u1', 'ghost')).resolves.toBeUndefined();
  });

  it('listAllGroupAssignments returns every row', async () => {
    await adapter().assignGroup('u2', 'editors');
    const all = await adapter().listAllGroupAssignments();
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const row of all) {
      expect(row.assignedAt).toBeInstanceOf(Date);
    }
  });

  it('purgeUser removes all rows for the user', async () => {
    await adapter().grantPermission('u2', 'posts.read');
    await adapter().purgeUser('u2');
    expect(await adapter().listUserGroups('u2')).toEqual([]);
    expect(await adapter().listUserPermissions('u2')).toEqual([]);
    await expect(adapter().purgeUser('ghost')).resolves.toBeUndefined();
  });
});
