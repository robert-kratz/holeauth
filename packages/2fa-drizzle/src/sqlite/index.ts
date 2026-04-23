import { sqliteTable, text, integer, type SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import { relations, eq } from 'drizzle-orm';
import type { TwoFactorAdapter, TwoFactorRecord } from '@holeauth/plugin-2fa';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqliteUsersTable = SQLiteTableWithColumns<any> & { id: any };

export interface CreateTwoFactorTablesOptions<U extends SqliteUsersTable> {
  usersTable: U;
  prefix?: string;
}

export function createTwoFactorTables<U extends SqliteUsersTable>(opts: CreateTwoFactorTablesOptions<U>) {
  const { usersTable, prefix = 'holeauth_2fa_' } = opts;
  const p = (s: string) => `${prefix}${s}`;
  const twoFactor = sqliteTable(p('credential'), {
    userId: text('user_id')
      .primaryKey()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    recoveryCodes: text('recovery_codes', { mode: 'json' }).$type<string[]>().notNull().default([]),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  });
  const twoFactorRelations = relations(twoFactor, ({ one }) => ({
    user: one(usersTable, { fields: [twoFactor.userId], references: [usersTable.id] }),
  }));
  return { tables: { twoFactor }, relations: { twoFactorRelations } };
}

type Tables = ReturnType<typeof createTwoFactorTables>['tables'];

export interface CreateTwoFactorAdapterOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  tables: Tables;
}

const rowToRecord = (r: Record<string, unknown>): TwoFactorRecord => ({
  userId: String(r.userId),
  secret: String(r.secret),
  enabled: Boolean(r.enabled),
  recoveryCodes: (r.recoveryCodes as string[] | null | undefined) ?? [],
  createdAt: r.createdAt as Date | undefined,
  updatedAt: r.updatedAt as Date | undefined,
});

export function createTwoFactorAdapter(opts: CreateTwoFactorAdapterOptions): TwoFactorAdapter {
  const { db, tables } = opts;
  const { twoFactor } = tables;
  return {
    async getByUserId(userId) {
      const rows = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    async upsert(record) {
      const [row] = await db
        .insert(twoFactor)
        .values({
          userId: record.userId,
          secret: record.secret,
          enabled: record.enabled,
          recoveryCodes: record.recoveryCodes,
        })
        .onConflictDoUpdate({
          target: twoFactor.userId,
          set: {
            secret: record.secret,
            enabled: record.enabled,
            recoveryCodes: record.recoveryCodes,
            updatedAt: new Date(),
          },
        })
        .returning();
      return rowToRecord(row);
    },
    async update(userId, patch) {
      const toSet: Record<string, unknown> = { ...patch, updatedAt: new Date() };
      delete toSet.userId;
      const [row] = await db.update(twoFactor).set(toSet).where(eq(twoFactor.userId, userId)).returning();
      return row ? rowToRecord(row) : null;
    },
    async delete(userId) {
      await db.delete(twoFactor).where(eq(twoFactor.userId, userId));
    },
  };
}
