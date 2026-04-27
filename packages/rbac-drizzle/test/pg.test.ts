/**
 * Integration tests for the Postgres rbac-drizzle adapter against a real
 * Postgres instance spun up via testcontainers. Exercises every CRUD
 * branch plus idempotent ON CONFLICT behaviour and purgeUser cascade.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { createRbacAdapter, createRbacTables } from '../src/pg/index.js';

const users = pgTable('app_users', { id: text('id').primaryKey() });
const built = createRbacTables({ usersTable: users });

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
    create table holeauth_rbac_user_group (
      user_id text not null references app_users(id) on delete cascade,
      group_id text not null,
      assigned_at timestamptz not null default now(),
      primary key (user_id, group_id)
    );
    create table holeauth_rbac_user_permission (
      user_id text not null references app_users(id) on delete cascade,
      node text not null,
      assigned_at timestamptz not null default now(),
      primary key (user_id, node)
    );
    insert into app_users (id) values ('u1'), ('u2');
  `));
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('rbac-drizzle (pg) — schema builders', () => {
  it('exposes the userGroups / userPermissions tables', () => {
    expect(built.tables.userGroups).toBeDefined();
    expect(built.tables.userPermissions).toBeDefined();
    expect(built.tables.groups).toBeUndefined();
    expect(built.relations.userGroupsRelations).toBeDefined();
    expect(built.relations.userPermissionsRelations).toBeDefined();
  });

  it('opts in to a groups table when persistGroups: true', () => {
    const c = createRbacTables({ usersTable: users, persistGroups: true });
    expect(c.tables.groups).toBeDefined();
  });

  it('honours a custom prefix', () => {
    const c = createRbacTables({ usersTable: users, prefix: 'zz_' });
    expect(c.tables.userGroups).toBeDefined();
  });
});

describe('rbac-drizzle (pg) — adapter CRUD', () => {
  const adapter = () => createRbacAdapter({ db, tables: built.tables });

  it('listUserGroups returns an empty array for a fresh user', async () => {
    expect(await adapter().listUserGroups('u1')).toEqual([]);
  });

  it('assignGroup inserts a row', async () => {
    await adapter().assignGroup('u1', 'admins');
    expect(await adapter().listUserGroups('u1')).toEqual(['admins']);
  });

  it('assignGroup is idempotent (ON CONFLICT DO NOTHING)', async () => {
    await adapter().assignGroup('u1', 'admins');
    await adapter().assignGroup('u1', 'admins');
    expect(await adapter().listUserGroups('u1')).toEqual(['admins']);
  });

  it('assignGroup supports multiple groups per user', async () => {
    await adapter().assignGroup('u1', 'editors');
    const groups = (await adapter().listUserGroups('u1')).sort();
    expect(groups).toEqual(['admins', 'editors']);
  });

  it('removeGroup deletes the matching assignment', async () => {
    await adapter().removeGroup('u1', 'editors');
    expect(await adapter().listUserGroups('u1')).toEqual(['admins']);
  });

  it('removeGroup on a missing assignment is a no-op', async () => {
    await expect(adapter().removeGroup('u1', 'ghost')).resolves.toBeUndefined();
  });

  it('listUserPermissions returns an empty array for a fresh user', async () => {
    expect(await adapter().listUserPermissions('u1')).toEqual([]);
  });

  it('grantPermission inserts a row', async () => {
    await adapter().grantPermission('u1', 'posts.read');
    expect(await adapter().listUserPermissions('u1')).toEqual(['posts.read']);
  });

  it('grantPermission is idempotent', async () => {
    await adapter().grantPermission('u1', 'posts.read');
    await adapter().grantPermission('u1', 'posts.read');
    expect(await adapter().listUserPermissions('u1')).toEqual(['posts.read']);
  });

  it('revokePermission deletes the matching row', async () => {
    await adapter().grantPermission('u1', 'posts.write');
    await adapter().revokePermission('u1', 'posts.write');
    expect(await adapter().listUserPermissions('u1')).toEqual(['posts.read']);
  });

  it('revokePermission on missing node is a no-op', async () => {
    await expect(adapter().revokePermission('u1', 'ghost')).resolves.toBeUndefined();
  });

  it('listAllGroupAssignments returns every row', async () => {
    await adapter().assignGroup('u2', 'editors');
    const all = await adapter().listAllGroupAssignments();
    expect(all).toHaveLength(2);
    const sorted = [...all].sort((a, b) => a.userId.localeCompare(b.userId));
    expect(sorted[0]!.userId).toBe('u1');
    expect(sorted[0]!.groupId).toBe('admins');
    expect(sorted[0]!.assignedAt).toBeInstanceOf(Date);
    expect(sorted[1]!.userId).toBe('u2');
    expect(sorted[1]!.groupId).toBe('editors');
  });

  it('purgeUser removes all group + permission rows for that user', async () => {
    await adapter().grantPermission('u2', 'posts.read');
    await adapter().purgeUser('u2');
    expect(await adapter().listUserGroups('u2')).toEqual([]);
    expect(await adapter().listUserPermissions('u2')).toEqual([]);
  });

  it('purgeUser on a user with no rows is a no-op', async () => {
    await expect(adapter().purgeUser('ghost')).resolves.toBeUndefined();
  });
});
