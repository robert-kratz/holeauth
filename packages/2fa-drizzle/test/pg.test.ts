import { describe, it, expect } from 'vitest';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { createTwoFactorTables, createTwoFactorAdapter } from '../src/pg/index.js';

const users = pgTable('users', { id: text('id').primaryKey() });

describe('2fa-drizzle (pg)', () => {
  it('creates the two_factor table', () => {
    const { tables } = createTwoFactorTables({ usersTable: users });
    expect(tables.twoFactor).toBeDefined();
  });

  it('exposes the adapter interface', () => {
    const { tables } = createTwoFactorTables({ usersTable: users });
    const a = createTwoFactorAdapter({ db: {}, tables });
    for (const fn of ['getByUserId', 'upsert', 'update', 'delete'] as const) {
      expect(typeof a[fn]).toBe('function');
    }
  });
});
