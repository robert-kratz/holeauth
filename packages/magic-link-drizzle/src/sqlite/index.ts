import {
  sqliteTable,
  text,
  integer,
  index,
  type SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import { relations, eq, and, isNull, lt, desc, gt } from 'drizzle-orm';
import type {
  MagicLinkAdapter,
  MagicLinkRecord,
  MagicLinkTokenType,
} from '@holeauth/plugin-magic-link';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqliteUsersTable = SQLiteTableWithColumns<any> & { id: any };

export interface CreateMagicLinkTablesOptions<U extends SqliteUsersTable> {
  usersTable: U;
  prefix?: string;
}

export function createMagicLinkTables<U extends SqliteUsersTable>(
  opts: CreateMagicLinkTablesOptions<U>,
) {
  const { usersTable, prefix = 'holeauth_magic_link_' } = opts;
  const p = (s: string) => `${prefix}${s}`;

  const magicLinkTokens = sqliteTable(
    p('tokens'),
    {
      id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
      identifier: text('identifier').notNull(),
      tokenHash: text('token_hash').notNull().unique(),
      type: text('type').notNull().$type<MagicLinkTokenType>(),
      userId: text('user_id').references(() => usersTable.id, { onDelete: 'cascade' }),
      usedAt: integer('used_at', { mode: 'timestamp_ms' }),
      expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
      createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date()),
    },
    (t) => ({
      identifierIdx: index('magic_link_identifier_idx').on(t.identifier),
      expiresIdx: index('magic_link_expires_idx').on(t.expiresAt),
    }),
  );

  const magicLinkTokensRelations = relations(magicLinkTokens, ({ one }) => ({
    user: one(usersTable, {
      fields: [magicLinkTokens.userId],
      references: [usersTable.id],
    }),
  }));

  return {
    tables: { magicLinkTokens },
    relations: { magicLinkTokensRelations },
  };
}

type Tables = ReturnType<typeof createMagicLinkTables>['tables'];

export interface CreateMagicLinkAdapterOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  tables: Tables;
}

const rowToRecord = (r: Record<string, unknown>): MagicLinkRecord => ({
  id: String(r.id),
  identifier: String(r.identifier),
  tokenHash: String(r.tokenHash),
  type: r.type as MagicLinkTokenType,
  userId: (r.userId as string | null | undefined) ?? null,
  usedAt: (r.usedAt as Date | null | undefined) ?? null,
  expiresAt: r.expiresAt as Date,
  createdAt: r.createdAt as Date,
});

export function createMagicLinkAdapter(
  opts: CreateMagicLinkAdapterOptions,
): MagicLinkAdapter {
  const { db, tables } = opts;
  const { magicLinkTokens: t } = tables;

  return {
    async createToken(input) {
      const [row] = await db
        .insert(t)
        .values({
          identifier: input.identifier,
          tokenHash: input.tokenHash,
          type: input.type,
          userId: input.userId ?? null,
          expiresAt: input.expiresAt,
        })
        .returning();
      return rowToRecord(row);
    },
    async findByTokenHash(tokenHash) {
      const rows = await db.select().from(t).where(eq(t.tokenHash, tokenHash)).limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    async findActiveToken(identifier, type) {
      const now = new Date();
      const rows = await db
        .select()
        .from(t)
        .where(
          and(
            eq(t.identifier, identifier),
            eq(t.type, type),
            isNull(t.usedAt),
            gt(t.expiresAt, now),
          ),
        )
        .orderBy(desc(t.createdAt))
        .limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    /** @deprecated Use findActiveToken(identifier, 'otp') instead. */
    async findActiveOtp(identifier) {
      const now = new Date();
      const rows = await db
        .select()
        .from(t)
        .where(
          and(
            eq(t.identifier, identifier),
            eq(t.type, 'otp'),
            isNull(t.usedAt),
            gt(t.expiresAt, now),
          ),
        )
        .orderBy(desc(t.createdAt))
        .limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    async atomicConsumeByHash(tokenHash) {
      const now = new Date();
      // SQLite supports RETURNING since 3.35; Drizzle exposes it via .returning().
      const rows = await db
        .update(t)
        .set({ usedAt: now })
        .where(
          and(
            eq(t.tokenHash, tokenHash),
            isNull(t.usedAt),
            gt(t.expiresAt, now),
          ),
        )
        .returning();
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    async atomicConsumeById(id) {
      // No expiry check — callers pre-filter via findActiveToken.
      const rows = await db
        .update(t)
        .set({ usedAt: new Date() })
        .where(and(eq(t.id, id), isNull(t.usedAt)))
        .returning();
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    async deleteByIdentifier(identifier, type) {
      if (type) {
        await db.delete(t).where(and(eq(t.identifier, identifier), eq(t.type, type)));
      } else {
        await db.delete(t).where(eq(t.identifier, identifier));
      }
    },
    async deleteExpired() {
      await db.delete(t).where(lt(t.expiresAt, new Date()));
    },
    async deleteByUserId(userId) {
      await db.delete(t).where(eq(t.userId, userId));
    },
    async findLatestByIdentifier(identifier, type) {
      const rows = await db
        .select()
        .from(t)
        .where(and(eq(t.identifier, identifier), eq(t.type, type)))
        .orderBy(desc(t.createdAt))
        .limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
  };
}
