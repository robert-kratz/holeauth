import {
  mysqlTable,
  varchar,
  timestamp,
  boolean,
  json,
  type MySqlTableWithColumns,
} from 'drizzle-orm/mysql-core';
import { relations, eq } from 'drizzle-orm';
import type { TwoFactorAdapter, TwoFactorRecord } from '@holeauth/plugin-2fa';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MysqlUsersTable = MySqlTableWithColumns<any> & { id: any };

export interface CreateTwoFactorTablesOptions<U extends MysqlUsersTable> {
  usersTable: U;
  prefix?: string;
}

export function createTwoFactorTables<U extends MysqlUsersTable>(opts: CreateTwoFactorTablesOptions<U>) {
  const { usersTable, prefix = 'holeauth_2fa_' } = opts;
  const p = (s: string) => `${prefix}${s}`;
  const twoFactor = mysqlTable(p('credential'), {
    userId: varchar('user_id', { length: 191 })
      .primaryKey()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    secret: varchar('secret', { length: 191 }).notNull(),
    enabled: boolean('enabled').notNull().default(false),
    recoveryCodes: json('recovery_codes').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { fsp: 3 }).notNull().defaultNow(),
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
      return rows[0] ? rowToRecord(rows[0] as Record<string, unknown>) : null;
    },
    async upsert(record) {
      await db
        .insert(twoFactor)
        .values({
          userId: record.userId,
          secret: record.secret,
          enabled: record.enabled,
          recoveryCodes: record.recoveryCodes,
        })
        .onDuplicateKeyUpdate({
          set: {
            secret: record.secret,
            enabled: record.enabled,
            recoveryCodes: record.recoveryCodes,
            updatedAt: new Date(),
          },
        });
      const rows = await db.select().from(twoFactor).where(eq(twoFactor.userId, record.userId)).limit(1);
      return rowToRecord(rows[0] as Record<string, unknown>);
    },
    async update(userId, patch) {
      const toSet: Record<string, unknown> = { ...patch, updatedAt: new Date() };
      delete toSet.userId;
      await db.update(twoFactor).set(toSet).where(eq(twoFactor.userId, userId));
      const rows = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).limit(1);
      return rows[0] ? rowToRecord(rows[0] as Record<string, unknown>) : null;
    },
    async delete(userId) {
      await db.delete(twoFactor).where(eq(twoFactor.userId, userId));
    },
  };
}
