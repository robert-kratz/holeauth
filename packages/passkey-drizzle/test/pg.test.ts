import { describe, it, expect } from 'vitest';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { createPasskeyTables, createPasskeyAdapter } from '../src/pg/index.js';

const users = pgTable('users', { id: text('id').primaryKey() });

describe('passkey-drizzle (pg)', () => {
  it('creates the passkeys table', () => {
    const { tables } = createPasskeyTables({ usersTable: users });
    expect(tables.passkeys).toBeDefined();
  });

  it('exposes the adapter interface', () => {
    const { tables } = createPasskeyTables({ usersTable: users });
    const a = createPasskeyAdapter({ db: {}, tables });
    for (const fn of ['list', 'getByCredentialId', 'create', 'updateCounter', 'delete'] as const) {
      expect(typeof a[fn]).toBe('function');
    }
  });
});
