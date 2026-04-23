import { describe, it, expect } from 'vitest';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { createHoleauthTables, createHoleauthAdapters } from '../src/pg/index.js';

const users = pgTable('users', { id: text('id').primaryKey(), email: text('email').notNull() });

describe('createHoleauthTables (pg)', () => {
  it('builds the expected tables with the default prefix', () => {
    const { tables } = createHoleauthTables({ usersTable: users });
    expect(tables.users).toBe(users);
    expect(tables.sessions).toBeDefined();
    expect(tables.accounts).toBeDefined();
    expect(tables.verificationTokens).toBeDefined();
    expect(tables.auditLog).toBeDefined();
  });

  it('supports a custom prefix', () => {
    const a = createHoleauthTables({ usersTable: users, prefix: 'ha_' });
    const b = createHoleauthTables({ usersTable: users, prefix: 'xx_' });
    expect(a.tables.sessions).not.toBe(b.tables.sessions);
  });
});

describe('createHoleauthAdapters (pg)', () => {
  it('returns all six adapter surfaces', () => {
    const { tables } = createHoleauthTables({ usersTable: users });
    const db = {
      transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    };
    const bundle = createHoleauthAdapters({ db, tables });
    expect(typeof bundle.user.getUserById).toBe('function');
    expect(typeof bundle.session.createSession).toBe('function');
    expect(typeof bundle.account.linkAccount).toBe('function');
    expect(typeof bundle.verificationToken.create).toBe('function');
    expect(typeof bundle.auditLog.record).toBe('function');
    expect(typeof bundle.transaction.run).toBe('function');
  });

  it('delegates transaction.run to db.transaction', async () => {
    const { tables } = createHoleauthTables({ usersTable: users });
    let called = false;
    const db = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        called = true;
        return fn({});
      },
    };
    const { transaction } = createHoleauthAdapters({ db, tables });
    const result = await transaction.run(async () => 42);
    expect(called).toBe(true);
    expect(result).toBe(42);
  });
});
