import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  json,
  index,
  uniqueIndex,
  primaryKey,
  type MySqlTableWithColumns,
} from 'drizzle-orm/mysql-core';
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
export type MysqlUsersTable = MySqlTableWithColumns<any> & { id: any };

export interface CreateHoleauthTablesOptions<U extends MysqlUsersTable> {
  usersTable: U;
  prefix?: string;
}

export function createHoleauthTables<U extends MysqlUsersTable>(
  opts: CreateHoleauthTablesOptions<U>,
) {
  const { usersTable, prefix = 'holeauth_' } = opts;
  const p = (s: string) => `${prefix}${s}`;

  const sessions = mysqlTable(
    p('session'),
    {
      id: varchar('id', { length: 191 }).primaryKey(),
      userId: varchar('user_id', { length: 191 })
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      familyId: varchar('family_id', { length: 191 }).notNull(),
      refreshTokenHash: varchar('refresh_token_hash', { length: 191 }).notNull(),
      expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
      createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
      revokedAt: timestamp('revoked_at', { fsp: 3 }),
      userAgent: text('user_agent'),
      ip: varchar('ip', { length: 64 }),
    },
    (t) => ({
      familyIdx: index(`${p('session')}_family_idx`).on(t.familyId),
      hashIdx: uniqueIndex(`${p('session')}_hash_idx`).on(t.refreshTokenHash),
      userIdx: index(`${p('session')}_user_idx`).on(t.userId),
    }),
  );

  const accounts = mysqlTable(
    p('account'),
    {
      id: varchar('id', { length: 191 }).primaryKey(),
      userId: varchar('user_id', { length: 191 })
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      provider: varchar('provider', { length: 191 }).notNull(),
      providerAccountId: varchar('provider_account_id', { length: 191 }).notNull(),
      email: varchar('email', { length: 320 }),
      accessToken: text('access_token'),
      refreshToken: text('refresh_token'),
      expiresAt: timestamp('expires_at', { fsp: 3 }),
      tokenType: varchar('token_type', { length: 64 }),
      scope: text('scope'),
      idToken: text('id_token'),
    },
    (t) => ({
      providerIdx: uniqueIndex(`${p('account')}_provider_idx`).on(t.provider, t.providerAccountId),
      userIdx: index(`${p('account')}_user_idx`).on(t.userId),
    }),
  );

  const verificationTokens = mysqlTable(
    p('verification_token'),
    {
      identifier: varchar('identifier', { length: 320 }).notNull(),
      token: varchar('token', { length: 191 }).notNull(),
      expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
    },
    (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
  );

  const auditLog = mysqlTable(
    p('audit_log'),
    {
      id: varchar('id', { length: 191 }).primaryKey(),
      type: varchar('type', { length: 64 }).notNull(),
      userId: varchar('user_id', { length: 191 }).references(() => usersTable.id, { onDelete: 'set null' }),
      sessionId: varchar('session_id', { length: 191 }),
      at: timestamp('at', { fsp: 3 }).notNull().defaultNow(),
      ip: varchar('ip', { length: 64 }),
      userAgent: text('user_agent'),
      data: json('data'),
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

type HoleauthTables<U extends MysqlUsersTable> = ReturnType<
  typeof createHoleauthTables<U>
>['tables'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MysqlDb = any;

export interface CreateHoleauthAdaptersOptions<U extends MysqlUsersTable> {
  db: MysqlDb;
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

export function createHoleauthAdapters<U extends MysqlUsersTable>(
  opts: CreateHoleauthAdaptersOptions<U>,
): HoleauthAdapterBundle {
  const { db, tables, userEmailColumn = 'email', generateId = () => crypto.randomUUID() } = opts;
  const { users, sessions, accounts, verificationTokens, auditLog } = tables;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailCol = (users as any)[userEmailColumn];
  if (!emailCol) {
    throw new Error(`[holeauth] usersTable missing "${userEmailColumn}" column.`);
  }

  const one = <T>(rows: T[]): T | undefined => rows[0];

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
      const row = one(rows);
      return row ? userRowToAdapter(row as Record<string, unknown>) : null;
    },
    async getUserByEmail(email) {
      const rows = await db.select().from(users).where(eq(emailCol, email)).limit(1);
      const row = one(rows);
      return row ? userRowToAdapter(row as Record<string, unknown>) : null;
    },
    async createUser(data) {
      const id = generateId();
      await db.insert(users).values({
        id,
        [userEmailColumn]: data.email,
        emailVerified: data.emailVerified ?? null,
        name: data.name ?? null,
        image: data.image ?? null,
        passwordHash: data.passwordHash ?? null,
      });
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return userRowToAdapter(rows[0] as Record<string, unknown>);
    },
    async updateUser(id, patch) {
      const toSet: Record<string, unknown> = { ...patch };
      if ('email' in toSet) {
        toSet[userEmailColumn] = toSet.email;
        if (userEmailColumn !== 'email') delete toSet.email;
      }
      await db.update(users).set(toSet).where(eq(users.id, id));
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      const row = one(rows);
      if (!row) throw new Error(`User ${id} not found`);
      return userRowToAdapter(row as Record<string, unknown>);
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
      await db.insert(sessions).values(data);
      const rows = await db.select().from(sessions).where(eq(sessions.id, data.id)).limit(1);
      return sessionRowToAdapter(rows[0] as Record<string, unknown>);
    },
    async getSession(id) {
      const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      return rows[0] ? sessionRowToAdapter(rows[0] as Record<string, unknown>) : null;
    },
    async getByRefreshHash(hash) {
      const rows = await db.select().from(sessions).where(eq(sessions.refreshTokenHash, hash)).limit(1);
      return rows[0] ? sessionRowToAdapter(rows[0] as Record<string, unknown>) : null;
    },
    async findByFamily(familyId) {
      const rows = await db.select().from(sessions).where(eq(sessions.familyId, familyId));
      return (rows as Record<string, unknown>[]).map(sessionRowToAdapter);
    },
    async deleteSession(id) {
      await db.delete(sessions).where(eq(sessions.id, id));
    },
    async rotateRefresh(id, newHash, expiresAt) {
      await db.update(sessions).set({ refreshTokenHash: newHash, expiresAt }).where(eq(sessions.id, id));
      const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      const row = one(rows);
      if (!row) throw new Error(`Session ${id} not found`);
      return sessionRowToAdapter(row as Record<string, unknown>);
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
      const id = generateId();
      await db.insert(accounts).values({ id, ...data });
      const rows = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
      return accountRowToAdapter(rows[0] as Record<string, unknown>);
    },
    async getAccountByProvider(provider, providerAccountId) {
      const rows = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.provider, provider), eq(accounts.providerAccountId, providerAccountId)))
        .limit(1);
      return rows[0] ? accountRowToAdapter(rows[0] as Record<string, unknown>) : null;
    },
    async getByProviderEmail(provider, email) {
      const rows = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.provider, provider), eq(accounts.email, email)))
        .limit(1);
      return rows[0] ? accountRowToAdapter(rows[0] as Record<string, unknown>) : null;
    },
    async listByUser(userId) {
      const rows = await db.select().from(accounts).where(eq(accounts.userId, userId));
      return (rows as Record<string, unknown>[]).map(accountRowToAdapter);
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
      await db.insert(verificationTokens).values(data);
      return vtRowToAdapter(data as unknown as Record<string, unknown>);
    },
    async consume(identifier, token) {
      const rows = await db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      await db
        .delete(verificationTokens)
        .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)));
      const rec = vtRowToAdapter(row as Record<string, unknown>);
      return rec.expiresAt.getTime() < Date.now() ? null : rec;
    },
    async purgeExpired() {
      const existing = await db
        .select({ identifier: verificationTokens.identifier })
        .from(verificationTokens)
        .where(sql`${verificationTokens.expiresAt} < NOW()`);
      await db.delete(verificationTokens).where(sql`${verificationTokens.expiresAt} < NOW()`);
      return (existing as unknown[]).length;
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
      return (rows as Record<string, unknown>[]).map(auditRowToAdapter);
    },
  };

  const transaction: TransactionAdapter = {
    async run(fn) {
      return db.transaction(async () => fn());
    },
  };

  return { user, session, account, verificationToken, auditLog: auditLogAdapter, transaction };
}
