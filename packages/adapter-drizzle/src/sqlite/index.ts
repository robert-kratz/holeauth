import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  type SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import { relations, eq, and, sql } from 'drizzle-orm';
import type {
  AdapterUser,
  AdapterSession,
  AdapterAccount,
  AdapterVerificationToken,
  AdapterAuditEvent,
  UserAdapter,
  SessionAdapter,
  AccountAdapter,
  VerificationTokenAdapter,
  AuditLogAdapter,
  TransactionAdapter,
} from '@holeauth/core/adapters';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqliteUsersTable = SQLiteTableWithColumns<any> & { id: any };

export interface CreateHoleauthTablesOptions<U extends SqliteUsersTable> {
  usersTable: U;
  prefix?: string;
}

export function createHoleauthTables<U extends SqliteUsersTable>(
  opts: CreateHoleauthTablesOptions<U>,
) {
  const { usersTable, prefix = 'holeauth_' } = opts;
  const p = (s: string) => `${prefix}${s}`;

  const sessions = sqliteTable(
    p('session'),
    {
      id: text('id').primaryKey(),
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      familyId: text('family_id').notNull(),
      refreshTokenHash: text('refresh_token_hash').notNull(),
      expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
      createdAt: integer('created_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date()),
      revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
      userAgent: text('user_agent'),
      ip: text('ip'),
    },
    (t) => ({
      familyIdx: index(`${p('session')}_family_idx`).on(t.familyId),
      hashIdx: uniqueIndex(`${p('session')}_hash_idx`).on(t.refreshTokenHash),
      userIdx: index(`${p('session')}_user_idx`).on(t.userId),
    }),
  );

  const accounts = sqliteTable(
    p('account'),
    {
      id: text('id').primaryKey(),
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      provider: text('provider').notNull(),
      providerAccountId: text('provider_account_id').notNull(),
      email: text('email'),
      accessToken: text('access_token'),
      refreshToken: text('refresh_token'),
      expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
      tokenType: text('token_type'),
      scope: text('scope'),
      idToken: text('id_token'),
    },
    (t) => ({
      providerIdx: uniqueIndex(`${p('account')}_provider_idx`).on(t.provider, t.providerAccountId),
      userIdx: index(`${p('account')}_user_idx`).on(t.userId),
    }),
  );

  const verificationTokens = sqliteTable(
    p('verification_token'),
    {
      identifier: text('identifier').notNull(),
      token: text('token').notNull(),
      expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    },
    (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
  );

  const auditLog = sqliteTable(
    p('audit_log'),
    {
      id: text('id').primaryKey(),
      type: text('type').notNull(),
      userId: text('user_id').references(() => usersTable.id, { onDelete: 'set null' }),
      sessionId: text('session_id'),
      at: integer('at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date()),
      ip: text('ip'),
      userAgent: text('user_agent'),
      data: text('data', { mode: 'json' }),
    },
    (t) => ({
      typeIdx: index(`${p('audit_log')}_type_idx`).on(t.type),
      userIdx: index(`${p('audit_log')}_user_idx`).on(t.userId),
    }),
  );

  const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(usersTable, { fields: [sessions.userId], references: [usersTable.id] }),
  }));
  const accountsRelations = relations(accounts, ({ one }) => ({
    user: one(usersTable, { fields: [accounts.userId], references: [usersTable.id] }),
  }));
  const auditLogRelations = relations(auditLog, ({ one }) => ({
    user: one(usersTable, { fields: [auditLog.userId], references: [usersTable.id] }),
  }));

  return {
    tables: { users: usersTable, sessions, accounts, verificationTokens, auditLog },
    relations: { sessionsRelations, accountsRelations, auditLogRelations },
  };
}

type HoleauthTables<U extends SqliteUsersTable> = ReturnType<
  typeof createHoleauthTables<U>
>['tables'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqliteDb = any;

export interface CreateHoleauthAdaptersOptions<U extends SqliteUsersTable> {
  db: SqliteDb;
  tables: HoleauthTables<U>;
  userEmailColumn?: string;
  generateId?: () => string;
}

export interface HoleauthAdapterBundle {
  user: UserAdapter;
  session: SessionAdapter;
  account: AccountAdapter;
  verificationToken: VerificationTokenAdapter;
  auditLog: AuditLogAdapter;
  transaction: TransactionAdapter;
}

export function createHoleauthAdapters<U extends SqliteUsersTable>(
  opts: CreateHoleauthAdaptersOptions<U>,
): HoleauthAdapterBundle {
  const { db, tables, userEmailColumn = 'email', generateId = () => crypto.randomUUID() } = opts;
  const { users, sessions, accounts, verificationTokens, auditLog } = tables;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailCol = (users as any)[userEmailColumn];
  if (!emailCol) {
    throw new Error(`[holeauth] usersTable missing "${userEmailColumn}" column.`);
  }

  const userRowToAdapter = (r: Record<string, unknown>): AdapterUser => ({
    id: String(r.id),
    email: String(r[userEmailColumn] ?? ''),
    emailVerified: (r.emailVerified as Date | null | undefined) ?? null,
    name: (r.name as string | null | undefined) ?? null,
    image: (r.image as string | null | undefined) ?? null,
    passwordHash: (r.passwordHash as string | null | undefined) ?? null,
  });

  const user: UserAdapter = {
    async getUserById(id) {
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return rows[0] ? userRowToAdapter(rows[0]) : null;
    },
    async getUserByEmail(email) {
      const rows = await db.select().from(users).where(eq(emailCol, email)).limit(1);
      return rows[0] ? userRowToAdapter(rows[0]) : null;
    },
    async createUser(data) {
      const id = generateId();
      const [row] = await db
        .insert(users)
        .values({
          id,
          [userEmailColumn]: data.email,
          emailVerified: data.emailVerified ?? null,
          name: data.name ?? null,
          image: data.image ?? null,
          passwordHash: data.passwordHash ?? null,
        })
        .returning();
      return userRowToAdapter(row);
    },
    async updateUser(id, patch) {
      const toSet: Record<string, unknown> = { ...patch };
      if ('email' in toSet) {
        toSet[userEmailColumn] = toSet.email;
        if (userEmailColumn !== 'email') delete toSet.email;
      }
      const [row] = await db.update(users).set(toSet).where(eq(users.id, id)).returning();
      if (!row) throw new Error(`User ${id} not found`);
      return userRowToAdapter(row);
    },
    async deleteUser(id) {
      await db.delete(users).where(eq(users.id, id));
    },
  };

  const sessionRowToAdapter = (r: Record<string, unknown>): AdapterSession => ({
    id: String(r.id),
    userId: String(r.userId),
    familyId: String(r.familyId),
    refreshTokenHash: String(r.refreshTokenHash),
    expiresAt: r.expiresAt as Date,
    createdAt: r.createdAt as Date | undefined,
    revokedAt: (r.revokedAt as Date | null | undefined) ?? null,
    userAgent: (r.userAgent as string | null | undefined) ?? null,
    ip: (r.ip as string | null | undefined) ?? null,
  });

  const session: SessionAdapter = {
    async createSession(data) {
      const [row] = await db.insert(sessions).values(data).returning();
      return sessionRowToAdapter(row);
    },
    async getSession(id) {
      const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      return rows[0] ? sessionRowToAdapter(rows[0]) : null;
    },
    async getByRefreshHash(hash) {
      const rows = await db.select().from(sessions).where(eq(sessions.refreshTokenHash, hash)).limit(1);
      return rows[0] ? sessionRowToAdapter(rows[0]) : null;
    },
    async findByFamily(familyId) {
      const rows = await db.select().from(sessions).where(eq(sessions.familyId, familyId));
      return rows.map(sessionRowToAdapter);
    },
    async deleteSession(id) {
      await db.delete(sessions).where(eq(sessions.id, id));
    },
    async rotateRefresh(id, newHash, expiresAt) {
      const [row] = await db
        .update(sessions)
        .set({ refreshTokenHash: newHash, expiresAt })
        .where(eq(sessions.id, id))
        .returning();
      if (!row) throw new Error(`Session ${id} not found`);
      return sessionRowToAdapter(row);
    },
    async revokeFamily(familyId) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.familyId, familyId), sql`${sessions.revokedAt} IS NULL`));
    },
    async revokeUser(userId) {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), sql`${sessions.revokedAt} IS NULL`));
    },
  };

  const accountRowToAdapter = (r: Record<string, unknown>): AdapterAccount => ({
    id: String(r.id),
    userId: String(r.userId),
    provider: String(r.provider),
    providerAccountId: String(r.providerAccountId),
    email: (r.email as string | null | undefined) ?? null,
    accessToken: (r.accessToken as string | null | undefined) ?? null,
    refreshToken: (r.refreshToken as string | null | undefined) ?? null,
    expiresAt: (r.expiresAt as Date | null | undefined) ?? null,
    tokenType: (r.tokenType as string | null | undefined) ?? null,
    scope: (r.scope as string | null | undefined) ?? null,
    idToken: (r.idToken as string | null | undefined) ?? null,
  });

  const account: AccountAdapter = {
    async linkAccount(data) {
      const [row] = await db.insert(accounts).values({ id: generateId(), ...data }).returning();
      return accountRowToAdapter(row);
    },
    async getAccountByProvider(provider, providerAccountId) {
      const rows = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)))
        .limit(1);
      return rows[0] ? accountRowToAdapter(rows[0]) : null;
    },
    async getByProviderEmail(provider, email) {
      const rows = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.provider, provider), eq(accounts.email, email)))
        .limit(1);
      return rows[0] ? accountRowToAdapter(rows[0]) : null;
    },
    async listByUser(userId) {
      const rows = await db.select().from(accounts).where(eq(accounts.userId, userId));
      return rows.map(accountRowToAdapter);
    },
    async unlinkAccount(id) {
      await db.delete(accounts).where(eq(accounts.id, id));
    },
  };

  const vtRowToAdapter = (r: Record<string, unknown>): AdapterVerificationToken => ({
    identifier: String(r.identifier),
    token: String(r.token),
    expiresAt: r.expiresAt as Date,
  });

  const verificationToken: VerificationTokenAdapter = {
    async create(data) {
      const [row] = await db.insert(verificationTokens).values(data).returning();
      return vtRowToAdapter(row);
    },
    async consume(identifier, token) {
      const [row] = await db
        .delete(verificationTokens)
        .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)))
        .returning();
      if (!row) return null;
      const rec = vtRowToAdapter(row);
      return rec.expiresAt.getTime() < Date.now() ? null : rec;
    },
    async purgeExpired() {
      const res = await db
        .delete(verificationTokens)
        .where(sql`${verificationTokens.expiresAt} < ${Date.now()}`)
        .returning({ identifier: verificationTokens.identifier });
      return res.length;
    },
  };

  const auditRowToAdapter = (r: Record<string, unknown>): AdapterAuditEvent => ({
    id: String(r.id),
    type: String(r.type),
    userId: (r.userId as string | null | undefined) ?? null,
    sessionId: (r.sessionId as string | null | undefined) ?? null,
    at: r.at as Date | undefined,
    ip: (r.ip as string | null | undefined) ?? null,
    userAgent: (r.userAgent as string | null | undefined) ?? null,
    data: (r.data as Record<string, unknown> | null | undefined) ?? null,
  });

  const auditLogAdapter: AuditLogAdapter = {
    async record(event) {
      await db.insert(auditLog).values({ id: event.id ?? generateId(), ...event });
    },
    async list(filter) {
      const conds = [];
      if (filter.userId) conds.push(eq(auditLog.userId, filter.userId));
      if (filter.type) conds.push(eq(auditLog.type, filter.type));
      const q = db.select().from(auditLog);
      const rows = conds.length
        ? await q.where(and(...conds)).limit(filter.limit ?? 100)
        : await q.limit(filter.limit ?? 100);
      return rows.map(auditRowToAdapter);
    },
  };

  const transaction: TransactionAdapter = {
    async run(fn) {
      return db.transaction(async () => fn());
    },
  };

  return { user, session, account, verificationToken, auditLog: auditLogAdapter, transaction };
}
