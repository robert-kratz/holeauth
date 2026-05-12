/**
 * MySQL adapter for @holeauth/plugin-idp.
 *
 * Mirrors the Postgres adapter (`../pg/index.ts`) but maps:
 *   - text().array() → json() (driver-side JSON.parse/stringify)
 *   - jsonb → json()
 *   - timestamp({ withTimezone, mode: 'date' }) → timestamp({ fsp: 3 })
 *   - onConflictDoUpdate → onDuplicateKeyUpdate
 *   - INSERT/UPDATE … RETURNING → insert/update then re-select
 *
 * The `codes.consume` claim is implemented as a SELECT + conditional UPDATE
 * pair (single-use tokens; the consumedAt timestamp is set only if the row
 * was previously unconsumed and unexpired).
 */
import {
  mysqlTable,
  varchar,
  text,
  boolean,
  timestamp,
  json,
  primaryKey,
  index,
  uniqueIndex,
  type MySqlTableWithColumns,
} from 'drizzle-orm/mysql-core';
import { relations, eq, and, sql, desc } from 'drizzle-orm';
import type {
  IdpAdapter,
  IdpApp,
  IdpAuthorizationCode,
  IdpConsent,
  IdpRefreshToken,
  IdpSigningKey,
  IdpTeam,
  IdpTeamMember,
  SigningAlg,
  TeamRole,
  AppType,
} from '@holeauth/plugin-idp';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MysqlUsersTable = MySqlTableWithColumns<any> & { id: any };

export interface CreateIdpTablesOptions<U extends MysqlUsersTable> {
  usersTable: U;
  prefix?: string;
}

export function createIdpTables<U extends MysqlUsersTable>(opts: CreateIdpTablesOptions<U>) {
  const { usersTable, prefix = 'holeauth_idp_' } = opts;
  const p = (s: string) => `${prefix}${s}`;

  const teams = mysqlTable(p('team'), {
    id: varchar('id', { length: 191 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
  });

  const teamMembers = mysqlTable(
    p('team_member'),
    {
      teamId: varchar('team_id', { length: 191 })
        .notNull()
        .references(() => teams.id, { onDelete: 'cascade' }),
      userId: varchar('user_id', { length: 191 })
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      role: varchar('role', { length: 32 }).notNull().$type<TeamRole>(),
      addedAt: timestamp('added_at', { fsp: 3 }).notNull().defaultNow(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.teamId, t.userId] }),
      userIdx: index(`${p('team_member')}_user_idx`).on(t.userId),
    }),
  );

  const apps = mysqlTable(
    p('app'),
    {
      id: varchar('id', { length: 191 }).primaryKey(),
      teamId: varchar('team_id', { length: 191 })
        .notNull()
        .references(() => teams.id, { onDelete: 'cascade' }),
      name: varchar('name', { length: 255 }).notNull(),
      description: text('description'),
      logoUrl: text('logo_url'),
      type: varchar('type', { length: 32 }).notNull().$type<AppType>(),
      clientSecretHash: text('client_secret_hash'),
      redirectUris: json('redirect_uris').$type<string[]>().notNull(),
      allowedScopes: json('allowed_scopes').$type<string[]>().notNull(),
      requirePkce: boolean('require_pkce').notNull().default(true),
      createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { fsp: 3 }).notNull().defaultNow(),
      disabledAt: timestamp('disabled_at', { fsp: 3 }),
    },
    (t) => ({
      teamIdx: index(`${p('app')}_team_idx`).on(t.teamId),
    }),
  );

  const authorizationCodes = mysqlTable(
    p('authorization_code'),
    {
      codeHash: varchar('code_hash', { length: 191 }).primaryKey(),
      appId: varchar('app_id', { length: 191 })
        .notNull()
        .references(() => apps.id, { onDelete: 'cascade' }),
      userId: varchar('user_id', { length: 191 })
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      redirectUri: text('redirect_uri').notNull(),
      scope: text('scope').notNull(),
      nonce: varchar('nonce', { length: 191 }),
      codeChallenge: varchar('code_challenge', { length: 191 }),
      codeChallengeMethod: varchar('code_challenge_method', { length: 16 }),
      expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
      consumedAt: timestamp('consumed_at', { fsp: 3 }),
    },
    (t) => ({
      expiresIdx: index(`${p('authorization_code')}_expires_idx`).on(t.expiresAt),
    }),
  );

  const refreshTokens = mysqlTable(
    p('refresh_token'),
    {
      id: varchar('id', { length: 191 }).primaryKey(),
      tokenHash: varchar('token_hash', { length: 191 }).notNull(),
      appId: varchar('app_id', { length: 191 })
        .notNull()
        .references(() => apps.id, { onDelete: 'cascade' }),
      userId: varchar('user_id', { length: 191 })
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      familyId: varchar('family_id', { length: 191 }).notNull(),
      scope: text('scope').notNull(),
      expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
      createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
      revokedAt: timestamp('revoked_at', { fsp: 3 }),
    },
    (t) => ({
      hashIdx: uniqueIndex(`${p('refresh_token')}_hash_idx`).on(t.tokenHash),
      familyIdx: index(`${p('refresh_token')}_family_idx`).on(t.familyId),
      userIdx: index(`${p('refresh_token')}_user_idx`).on(t.userId),
      appIdx: index(`${p('refresh_token')}_app_idx`).on(t.appId),
    }),
  );

  const consents = mysqlTable(
    p('consent'),
    {
      userId: varchar('user_id', { length: 191 })
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      appId: varchar('app_id', { length: 191 })
        .notNull()
        .references(() => apps.id, { onDelete: 'cascade' }),
      scopesGranted: json('scopes_granted').$type<string[]>().notNull(),
      grantedAt: timestamp('granted_at', { fsp: 3 }).notNull().defaultNow(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.userId, t.appId] }),
    }),
  );

  const signingKeys = mysqlTable(p('signing_key'), {
    kid: varchar('kid', { length: 191 }).primaryKey(),
    alg: varchar('alg', { length: 16 }).notNull().$type<SigningAlg>(),
    publicJwk: json('public_jwk').$type<Record<string, unknown>>().notNull(),
    privateJwk: json('private_jwk').$type<Record<string, unknown>>().notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { fsp: 3 }),
  });

  const teamMembersRelations = relations(teamMembers, ({ one }) => ({
    team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
    user: one(usersTable, { fields: [teamMembers.userId], references: [usersTable.id] }),
  }));
  const appsRelations = relations(apps, ({ one }) => ({
    team: one(teams, { fields: [apps.teamId], references: [teams.id] }),
  }));

  return {
    tables: {
      teams,
      teamMembers,
      apps,
      authorizationCodes,
      refreshTokens,
      consents,
      signingKeys,
    },
    relations: { teamMembersRelations, appsRelations },
  };
}

/* ────────────────────────── adapter ────────────────────────── */

type Tables = ReturnType<typeof createIdpTables>['tables'];

export interface CreateIdpAdapterOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  tables: Tables;
  generateId?: () => string;
}

const appRow = (r: Record<string, unknown>): IdpApp => ({
  id: String(r.id),
  teamId: String(r.teamId),
  name: String(r.name),
  description: (r.description as string | null) ?? null,
  logoUrl: (r.logoUrl as string | null) ?? null,
  type: r.type as AppType,
  clientSecretHash: (r.clientSecretHash as string | null) ?? null,
  redirectUris: (r.redirectUris as string[] | null) ?? [],
  allowedScopes: (r.allowedScopes as string[] | null) ?? [],
  requirePkce: Boolean(r.requirePkce),
  createdAt: r.createdAt as Date,
  updatedAt: r.updatedAt as Date,
  disabledAt: (r.disabledAt as Date | null) ?? null,
});

const teamRow = (r: Record<string, unknown>): IdpTeam => ({
  id: String(r.id),
  name: String(r.name),
  createdAt: r.createdAt as Date,
});

const memberRow = (r: Record<string, unknown>): IdpTeamMember => ({
  teamId: String(r.teamId),
  userId: String(r.userId),
  role: r.role as TeamRole,
  addedAt: r.addedAt as Date,
});

const codeRow = (r: Record<string, unknown>): IdpAuthorizationCode => ({
  codeHash: String(r.codeHash),
  appId: String(r.appId),
  userId: String(r.userId),
  redirectUri: String(r.redirectUri),
  scope: String(r.scope),
  nonce: (r.nonce as string | null) ?? null,
  codeChallenge: (r.codeChallenge as string | null) ?? null,
  codeChallengeMethod: (r.codeChallengeMethod as 'S256' | 'plain' | null) ?? null,
  expiresAt: r.expiresAt as Date,
  consumedAt: (r.consumedAt as Date | null) ?? null,
});

const refreshRow = (r: Record<string, unknown>): IdpRefreshToken => ({
  id: String(r.id),
  tokenHash: String(r.tokenHash),
  appId: String(r.appId),
  userId: String(r.userId),
  familyId: String(r.familyId),
  scope: String(r.scope),
  expiresAt: r.expiresAt as Date,
  createdAt: r.createdAt as Date,
  revokedAt: (r.revokedAt as Date | null) ?? null,
});

const consentRow = (r: Record<string, unknown>): IdpConsent => ({
  userId: String(r.userId),
  appId: String(r.appId),
  scopesGranted: (r.scopesGranted as string[] | null) ?? [],
  grantedAt: r.grantedAt as Date,
});

const keyRow = (r: Record<string, unknown>): IdpSigningKey => ({
  kid: String(r.kid),
  alg: r.alg as SigningAlg,
  publicJwk: r.publicJwk as Record<string, unknown>,
  privateJwk: r.privateJwk as Record<string, unknown>,
  active: Boolean(r.active),
  createdAt: r.createdAt as Date,
  rotatedAt: (r.rotatedAt as Date | null) ?? null,
});

export function createIdpAdapter(opts: CreateIdpAdapterOptions): IdpAdapter {
  const { db, tables, generateId = () => crypto.randomUUID() } = opts;
  const { teams, teamMembers, apps, authorizationCodes, refreshTokens, consents, signingKeys } =
    tables;

  return {
    teams: {
      async create(input) {
        const id = generateId();
        await db.insert(teams).values({ id, name: input.name });
        await db
          .insert(teamMembers)
          .values({ teamId: id, userId: input.ownerUserId, role: 'owner' });
        const rows = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
        return teamRow(rows[0] as Record<string, unknown>);
      },
      async getById(teamId) {
        const rows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
        if (!rows.length) return null;
        return teamRow(rows[0] as Record<string, unknown>);
      },
      async delete(teamId) {
        await db.delete(teams).where(eq(teams.id, teamId));
      },
      async listForUser(userId) {
        const rows = await db
          .select({
            id: teams.id,
            name: teams.name,
            createdAt: teams.createdAt,
            role: teamMembers.role,
          })
          .from(teamMembers)
          .innerJoin(teams, eq(teamMembers.teamId, teams.id))
          .where(eq(teamMembers.userId, userId));
        return (rows as Record<string, unknown>[]).map((r) => ({
          ...teamRow(r),
          role: r.role as TeamRole,
        }));
      },
      async listMembers(teamId) {
        const rows = await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
        return (rows as Record<string, unknown>[]).map(memberRow);
      },
      async getMembership(teamId, userId) {
        const rows = await db
          .select()
          .from(teamMembers)
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
          .limit(1);
        if (!rows.length) return null;
        return memberRow(rows[0] as Record<string, unknown>);
      },
      async addMember(teamId, userId, role) {
        await db
          .insert(teamMembers)
          .values({ teamId, userId, role })
          .onDuplicateKeyUpdate({ set: { role } });
      },
      async removeMember(teamId, userId) {
        await db
          .delete(teamMembers)
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
      },
    },

    apps: {
      async create(input) {
        await db.insert(apps).values({
          id: input.id,
          teamId: input.teamId,
          name: input.name,
          description: input.description ?? null,
          logoUrl: input.logoUrl ?? null,
          type: input.type,
          clientSecretHash: input.clientSecretHash ?? null,
          redirectUris: input.redirectUris,
          allowedScopes: input.allowedScopes,
          requirePkce: input.requirePkce,
        });
        const rows = await db.select().from(apps).where(eq(apps.id, input.id)).limit(1);
        return appRow(rows[0] as Record<string, unknown>);
      },
      async getById(appId) {
        const rows = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
        if (!rows.length) return null;
        return appRow(rows[0] as Record<string, unknown>);
      },
      async listAll(_opts) {
        const rows = await db.select().from(apps).orderBy(desc(apps.createdAt));
        return (rows as Record<string, unknown>[]).map(appRow);
      },
      async listForTeam(teamId) {
        const rows = await db
          .select()
          .from(apps)
          .where(eq(apps.teamId, teamId))
          .orderBy(desc(apps.createdAt));
        return (rows as Record<string, unknown>[]).map(appRow);
      },
      async listForUser(userId) {
        const rows = await db
          .select({
            id: apps.id,
            teamId: apps.teamId,
            name: apps.name,
            description: apps.description,
            logoUrl: apps.logoUrl,
            type: apps.type,
            clientSecretHash: apps.clientSecretHash,
            redirectUris: apps.redirectUris,
            allowedScopes: apps.allowedScopes,
            requirePkce: apps.requirePkce,
            createdAt: apps.createdAt,
            updatedAt: apps.updatedAt,
            disabledAt: apps.disabledAt,
          })
          .from(apps)
          .innerJoin(teamMembers, eq(teamMembers.teamId, apps.teamId))
          .where(eq(teamMembers.userId, userId))
          .orderBy(desc(apps.createdAt));
        return (rows as Record<string, unknown>[]).map(appRow);
      },
      async update(appId, patch) {
        const set: Record<string, unknown> = { updatedAt: new Date() };
        if (patch.name !== undefined) set.name = patch.name;
        if (patch.description !== undefined) set.description = patch.description;
        if (patch.logoUrl !== undefined) set.logoUrl = patch.logoUrl;
        if (patch.redirectUris !== undefined) set.redirectUris = patch.redirectUris;
        if (patch.allowedScopes !== undefined) set.allowedScopes = patch.allowedScopes;
        if (patch.requirePkce !== undefined) set.requirePkce = patch.requirePkce;
        if (patch.clientSecretHash !== undefined) set.clientSecretHash = patch.clientSecretHash;
        if (patch.disabledAt !== undefined) set.disabledAt = patch.disabledAt;
        await db.update(apps).set(set).where(eq(apps.id, appId));
        const rows = await db.select().from(apps).where(eq(apps.id, appId)).limit(1);
        return appRow(rows[0] as Record<string, unknown>);
      },
      async delete(appId) {
        await db.delete(apps).where(eq(apps.id, appId));
      },
    },

    codes: {
      async create(input) {
        await db.insert(authorizationCodes).values({
          codeHash: input.codeHash,
          appId: input.appId,
          userId: input.userId,
          redirectUri: input.redirectUri,
          scope: input.scope,
          nonce: input.nonce,
          codeChallenge: input.codeChallenge,
          codeChallengeMethod: input.codeChallengeMethod,
          expiresAt: input.expiresAt,
        });
      },
      async consume(codeHash) {
        // MySQL: no RETURNING. Conditional UPDATE then SELECT.
        const now = new Date();
        const result = await db
          .update(authorizationCodes)
          .set({ consumedAt: now })
          .where(
            and(
              eq(authorizationCodes.codeHash, codeHash),
              sql`${authorizationCodes.consumedAt} IS NULL`,
              sql`${authorizationCodes.expiresAt} > NOW(3)`,
            ),
          );
        // mysql2 driver returns { affectedRows } via the array-like result shape.
        // Drizzle wraps it; check both common shapes defensively.
        const affected =
          (result as { affectedRows?: number })?.affectedRows ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (Array.isArray(result) ? (result[0] as any)?.affectedRows : undefined);
        if (!affected) return null;
        const rows = await db
          .select()
          .from(authorizationCodes)
          .where(eq(authorizationCodes.codeHash, codeHash))
          .limit(1);
        if (!rows.length) return null;
        return codeRow(rows[0] as Record<string, unknown>);
      },
    },

    refresh: {
      async create(input) {
        await db.insert(refreshTokens).values({
          id: input.id,
          tokenHash: input.tokenHash,
          appId: input.appId,
          userId: input.userId,
          familyId: input.familyId,
          scope: input.scope,
          expiresAt: input.expiresAt,
        });
        const rows = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.id, input.id))
          .limit(1);
        return refreshRow(rows[0] as Record<string, unknown>);
      },
      async getByHash(hash) {
        const rows = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, hash))
          .limit(1);
        if (!rows.length) return null;
        return refreshRow(rows[0] as Record<string, unknown>);
      },
      async markRevoked(id) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.id, id), sql`${refreshTokens.revokedAt} IS NULL`));
      },
      async revokeFamily(familyId) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(eq(refreshTokens.familyId, familyId), sql`${refreshTokens.revokedAt} IS NULL`),
          );
      },
      async revokeAllForUser(userId) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.userId, userId), sql`${refreshTokens.revokedAt} IS NULL`));
      },
      async revokeAllForApp(appId) {
        await db
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.appId, appId), sql`${refreshTokens.revokedAt} IS NULL`));
      },
      async listForApp(appId) {
        const rows = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.appId, appId))
          .orderBy(desc(refreshTokens.createdAt));
        return (rows as Record<string, unknown>[]).map(refreshRow);
      },
    },

    consent: {
      async get(userId, appId) {
        const rows = await db
          .select()
          .from(consents)
          .where(and(eq(consents.userId, userId), eq(consents.appId, appId)))
          .limit(1);
        if (!rows.length) return null;
        return consentRow(rows[0] as Record<string, unknown>);
      },
      async upsert(userId, appId, scopesGranted) {
        await db
          .insert(consents)
          .values({ userId, appId, scopesGranted })
          .onDuplicateKeyUpdate({ set: { scopesGranted, grantedAt: new Date() } });
      },
      async revoke(userId, appId) {
        await db
          .delete(consents)
          .where(and(eq(consents.userId, userId), eq(consents.appId, appId)));
      },
    },

    keys: {
      async listActive() {
        const rows = await db
          .select()
          .from(signingKeys)
          .where(eq(signingKeys.active, true))
          .orderBy(desc(signingKeys.createdAt));
        return (rows as Record<string, unknown>[]).map(keyRow);
      },
      async getActive() {
        const rows = await db
          .select()
          .from(signingKeys)
          .where(eq(signingKeys.active, true))
          .orderBy(desc(signingKeys.createdAt))
          .limit(1);
        if (!rows.length) return null;
        return keyRow(rows[0] as Record<string, unknown>);
      },
      async create(input) {
        await db.insert(signingKeys).values({
          kid: input.kid,
          alg: input.alg,
          publicJwk: input.publicJwk,
          privateJwk: input.privateJwk,
          active: true,
        });
        const rows = await db
          .select()
          .from(signingKeys)
          .where(eq(signingKeys.kid, input.kid))
          .limit(1);
        return keyRow(rows[0] as Record<string, unknown>);
      },
      async markRotated(kid) {
        await db
          .update(signingKeys)
          .set({ active: false, rotatedAt: new Date() })
          .where(eq(signingKeys.kid, kid));
      },
    },
  };
}
