import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
  type PgTableWithColumns,
} from 'drizzle-orm/pg-core';
import { relations, eq } from 'drizzle-orm';
import type { PasskeyAdapter, PasskeyRecord } from '@holeauth/plugin-passkey';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PgUsersTable = PgTableWithColumns<any> & { id: any };

export interface CreatePasskeyTablesOptions<U extends PgUsersTable> {
  usersTable: U;
  prefix?: string;
}

export function createPasskeyTables<U extends PgUsersTable>(opts: CreatePasskeyTablesOptions<U>) {
  const { usersTable, prefix = 'holeauth_passkey_' } = opts;
  const p = (s: string) => `${prefix}${s}`;
  const passkeys = pgTable(
    p('credential'),
    {
      id: text('id').primaryKey(),
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      credentialId: text('credential_id').notNull(),
      publicKey: text('public_key').notNull(),
      counter: integer('counter').notNull().default(0),
      transports: text('transports').array(),
      deviceName: text('device_name'),
      createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    },
    (t) => ({
      credIdx: uniqueIndex().on(t.credentialId),
      userIdx: index().on(t.userId),
    }),
  );
  const passkeysRelations = relations(passkeys, ({ one }) => ({
    user: one(usersTable, { fields: [passkeys.userId], references: [usersTable.id] }),
  }));
  return { tables: { passkeys }, relations: { passkeysRelations } };
}

type Tables = ReturnType<typeof createPasskeyTables>['tables'];

export interface CreatePasskeyAdapterOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  tables: Tables;
  generateId?: () => string;
}

const rowToRecord = (r: Record<string, unknown>): PasskeyRecord => ({
  id: String(r.id),
  userId: String(r.userId),
  credentialId: String(r.credentialId),
  publicKey: String(r.publicKey),
  counter: Number(r.counter),
  transports: (r.transports as string[] | null | undefined) ?? null,
  deviceName: (r.deviceName as string | null | undefined) ?? null,
  createdAt: r.createdAt as Date | undefined,
});

export function createPasskeyAdapter(opts: CreatePasskeyAdapterOptions): PasskeyAdapter {
  const { db, tables, generateId = () => crypto.randomUUID() } = opts;
  const { passkeys } = tables;
  return {
    async list(userId) {
      const rows = await db.select().from(passkeys).where(eq(passkeys.userId, userId));
      return (rows as Record<string, unknown>[]).map(rowToRecord);
    },
    async getByCredentialId(credentialId) {
      const rows = await db
        .select()
        .from(passkeys)
        .where(eq(passkeys.credentialId, credentialId))
        .limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    async create(data) {
      const [row] = await db
        .insert(passkeys)
        .values({ id: generateId(), ...data })
        .returning();
      return rowToRecord(row);
    },
    async updateCounter(credentialId, counter) {
      await db.update(passkeys).set({ counter }).where(eq(passkeys.credentialId, credentialId));
    },
    async delete(id) {
      await db.delete(passkeys).where(eq(passkeys.id, id));
    },
  };
}
