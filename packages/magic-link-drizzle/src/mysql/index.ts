import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  index,
  type MySqlTableWithColumns,
} from 'drizzle-orm/mysql-core';
import { relations, eq, and, isNull, lt, desc, gt } from 'drizzle-orm';
import type {
  MagicLinkAdapter,
  MagicLinkRecord,
  MagicLinkTokenType,
} from '@holeauth/plugin-magic-link';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MysqlUsersTable = MySqlTableWithColumns<any> & { id: any };

export interface CreateMagicLinkTablesOptions<U extends MysqlUsersTable> {
  usersTable: U;
  prefix?: string;
}

export function createMagicLinkTables<U extends MysqlUsersTable>(
  opts: CreateMagicLinkTablesOptions<U>,
) {
  const { usersTable, prefix = 'holeauth_magic_link_' } = opts;
  const p = (s: string) => `${prefix}${s}`;

  const magicLinkTokens = mysqlTable(
    p('tokens'),
    {
      id: varchar('id', { length: 36 })
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
      identifier: varchar('identifier', { length: 320 }).notNull(),
      tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
      type: varchar('type', { length: 16 }).notNull().$type<MagicLinkTokenType>(),
      userId: varchar('user_id', { length: 191 }).references(() => usersTable.id, {
        onDelete: 'cascade',
      }),
      usedAt: timestamp('used_at', { fsp: 3 }),
      expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
      createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
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
      const id = crypto.randomUUID();
      await db.insert(t).values({
        id,
        identifier: input.identifier,
        tokenHash: input.tokenHash,
        type: input.type,
        userId: input.userId ?? null,
        expiresAt: input.expiresAt,
      });
      const rows = await db.select().from(t).where(eq(t.id, id)).limit(1);
      return rowToRecord(rows[0] as Record<string, unknown>);
    },
    async findByTokenHash(tokenHash) {
      const rows = await db.select().from(t).where(eq(t.tokenHash, tokenHash)).limit(1);
      return rows[0] ? rowToRecord(rows[0] as Record<string, unknown>) : null;
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
      return rows[0] ? rowToRecord(rows[0] as Record<string, unknown>) : null;
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
      return rows[0] ? rowToRecord(rows[0] as Record<string, unknown>) : null;
    },
    async atomicConsumeByHash(tokenHash) {
      const now = new Date();
      // MySQL has no RETURNING. Strategy: run the conditional UPDATE first — only
      // one concurrent caller will get affectedRows > 0. Then SELECT to fetch the
      // full record. The SELECT is safe because usedAt is already set; the row
      // will not be modified again.
      const [result] = await db
        .update(t)
        .set({ usedAt: now })
        .where(
          and(
            eq(t.tokenHash, tokenHash),
            isNull(t.usedAt),
            gt(t.expiresAt, now),
          ),
        ) as unknown as [{ affectedRows: number }];
      if (!result || result.affectedRows === 0) return null;
      const rows = await db.select().from(t).where(eq(t.tokenHash, tokenHash)).limit(1);
      return rows[0] ? rowToRecord(rows[0] as Record<string, unknown>) : null;
    },
    async atomicConsumeById(id) {
      // No expiry check — callers pre-filter via findActiveToken.
      const [result] = await db
        .update(t)
        .set({ usedAt: new Date() })
        .where(and(eq(t.id, id), isNull(t.usedAt))) as unknown as [{ affectedRows: number }];
      if (!result || result.affectedRows === 0) return null;
      const rows = await db.select().from(t).where(eq(t.id, id)).limit(1);
      return rows[0] ? rowToRecord(rows[0] as Record<string, unknown>) : null;
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
      return rows[0] ? rowToRecord(rows[0] as Record<string, unknown>) : null;
    },
  };
}
