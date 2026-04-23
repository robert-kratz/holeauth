import { describe, it, expect } from 'vitest';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { createRbacTables, createRbacAdapter } from '../src/pg/index.js';

const users = pgTable('users', { id: text('id').primaryKey() });

describe('createRbacTables (pg)', () => {
  it('creates user_groups and user_permissions tables by default', () => {
    const { tables } = createRbacTables({ usersTable: users });
    expect(tables.userGroups).toBeDefined();
    expect(tables.userPermissions).toBeDefined();
    expect(tables.groups).toBeUndefined();
  });

  it('opts in to a groups table with persistGroups: true', () => {
    const { tables } = createRbacTables({ usersTable: users, persistGroups: true });
    expect(tables.groups).toBeDefined();
  });
});

describe('createRbacAdapter (pg)', () => {
  it('exposes the RbacAdapter surface', () => {
    const { tables } = createRbacTables({ usersTable: users });
    const adapter = createRbacAdapter({ db: {}, tables });
    const fns = [
      'listUserGroups',
      'listUserPermissions',
      'assignGroup',
      'removeGroup',
      'grantPermission',
      'revokePermission',
      'listAllGroupAssignments',
      'purgeUser',
    ] as const;
    for (const f of fns) expect(typeof adapter[f]).toBe('function');
  });
});
