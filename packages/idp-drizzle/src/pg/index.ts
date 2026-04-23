/**
 * Postgres adapter for @holeauth/plugin-idp.
 *
 * Exports:
 *   - `createIdpTables({ usersTable, prefix? })` — returns drizzle tables
 *     + relations. The `usersTable` must have at minimum an `id` column;
 *     team memberships reference users and cascade on delete.
 *   - `createIdpAdapter({ db, tables })` — constructs an IdpAdapter.
 *
 * The schema covers: teams + members, apps, authorization codes, refresh
 * tokens (with family ids), user × app consents, and signing keys (JWKs).
 */
import {
  pgTable,
  text,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  type PgTableWithColumns,
} from 'drizzle-orm/pg-core';
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
export type PgUsersTable = PgTableWithColumns<any> & { id: any };

export interface CreateIdpTablesOptions<U extends PgUsersTable> {
  usersTable: U;
  prefix?: string;
}

export function createIdpTables<U extends PgUsersTable>(opts: CreateIdpTablesOptions<U>) {
  const { usersTable, prefix = 'holeauth_idp_' } = opts;
  const p = (s: string) => `${prefix}${s}`;

  const teams = pgTable(p('team'), {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  });

  const teamMembers = pgTable(
    p('team_member'),
    {
      teamId: text('team_id')
        .notNull()
        .references(() => teams.id, { onDelete: 'cascade' }),
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      role: text('role').notNull().$type<TeamRole>(),
      addedAt: timestamp('added_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.teamId, t.userId] }),
      userIdx: index().on(t.userId),
    }),
  );

  const apps = pgTable(
    p('app'),
    {
      id: text('id').primaryKey(),
      teamId: text('team_id')
        .notNull()
        .references(() => teams.id, { onDelete: 'cascade' }),
      name: text('name').notNull(),
      description: text('description'),
      logoUrl: text('logo_url'),
      type: text('type').notNull().$type<AppType>(),
      clientSecretHash: text('client_secret_hash'),
      redirectUris: text('redirect_uris').array().notNull().default([]),
      allowedScopes: text('allowed_scopes').array().notNull().default([]),
      requirePkce: boolean('require_pkce').notNull().default(true),
      createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
      disabledAt: timestamp('disabled_at', { withTimezone: true, mode: 'date' }),
    },
    (t) => ({
      teamIdx: index().on(t.teamId),
    }),
  );

  const authorizationCodes = pgTable(
    p('authorization_code'),
    {
      codeHash: text('code_hash').primaryKey(),
      appId: text('app_id')
        .notNull()
        .references(() => apps.id, { onDelete: 'cascade' }),
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      redirectUri: text('redirect_uri').notNull(),
      scope: text('scope').notNull(),
      nonce: text('nonce'),
      codeChallenge: text('code_challenge'),
      codeChallengeMethod: text('code_challenge_method'),
      expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
      consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    },
    (t) => ({
      expiresIdx: index().on(t.expiresAt),
    }),
  );

  const refreshTokens = pgTable(
    p('refresh_token'),
    {
      id: text('id').primaryKey(),
      tokenHash: text('token_hash').notNull(),
      appId: text('app_id')
        .notNull()
        .references(() => apps.id, { onDelete: 'cascade' }),
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      familyId: text('family_id').notNull(),
      scope: text('scope').notNull(),
      expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
      createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
      revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    },
    (t) => ({
      hashIdx: uniqueIndex().on(t.tokenHash),
      familyIdx: index().on(t.familyId),
      userIdx: index().on(t.userId),
      appIdx: index().on(t.appId),
    }),
  );

  const consents = pgTable(
    p('consent'),
    {
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      appId: text('app_id')
        .notNull()
        .references(() => apps.id, { onDelete: 'cascade' }),
      scopesGranted: text('scopes_granted').array().notNull().default([]),
      grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.userId, t.appId] }),
    }),
  );

  const signingKeys = pgTable(p('signing_key'), {
    kid: text('kid').primaryKey(),
    alg: text('alg').notNull().$type<SigningAlg>(),
    publicJwk: jsonb('public_jwk').notNull().$type<Record<string, unknown>>(),
    privateJwk: jsonb('private_jwk').notNull().$type<Record<string, unknown>>(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true, mode: 'date' }),
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
        const [row] = await db
          .insert(teams)
          .values({ id, name: input.name })
          .returning();
        await db
          .insert(teamMembers)
          .values({ teamId: id, userId: input.ownerUserId, role: 'owner' });
        return teamRow(row as Record<string, unknown>);
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
          .onConflictDoUpdate({
            target: [teamMembers.teamId, teamMembers.userId],
            set: { role },
          });
      },
      async removeMember(teamId, userId) {
        await db
          .delete(teamMembers)
          .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
      },
    },

    apps: {
      async create(input) {
        const [row] = await db
          .insert(apps)
          .values({
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
          })
          .returning();
        return appRow(row as Record<string, unknown>);
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
        const [row] = await db.update(apps).set(set).where(eq(apps.id, appId)).returning();
        return appRow(row as Record<string, unknown>);
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
        // Atomic single-statement claim: only returns if row exists,
        // was not already consumed, and has not yet expired.
        const rows = await db
          .update(authorizationCodes)
          .set({ consumedAt: new Date() })
          .where(
            and(
              eq(authorizationCodes.codeHash, codeHash),
              sql`${authorizationCodes.consumedAt} IS NULL`,
              sql`${authorizationCodes.expiresAt} > NOW()`,
            ),
          )
          .returning();
        if (!rows.length) return null;
        return codeRow(rows[0] as Record<string, unknown>);
      },
    },

    refresh: {
      async create(input) {
        const [row] = await db
          .insert(refreshTokens)
          .values({
            id: input.id,
            tokenHash: input.tokenHash,
            appId: input.appId,
            userId: input.userId,
            familyId: input.familyId,
            scope: input.scope,
            expiresAt: input.expiresAt,
          })
          .returning();
        return refreshRow(row as Record<string, unknown>);
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
          .onConflictDoUpdate({
            target: [consents.userId, consents.appId],
            set: { scopesGranted, grantedAt: new Date() },
          });
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
        const [row] = await db
          .insert(signingKeys)
          .values({
            kid: input.kid,
            alg: input.alg,
            publicJwk: input.publicJwk,
            privateJwk: input.privateJwk,
            active: true,
          })
          .returning();
        return keyRow(row as Record<string, unknown>);
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
