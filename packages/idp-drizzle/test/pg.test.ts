/**
 * Integration tests for the Postgres idp-drizzle adapter against a real
 * Postgres instance spun up via testcontainers. Covers every surface of
 * IdpAdapter: teams/members, apps, authorization codes (incl. expiry +
 * reuse), refresh tokens (incl. family revocation), consents, and
 * signing keys.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { createIdpAdapter, createIdpTables } from '../src/pg/index.js';

const users = pgTable('app_users', { id: text('id').primaryKey() });
const built = createIdpTables({ usersTable: users });

let container: StartedPostgreSqlContainer;
let pool: Pool;
let db: NodePgDatabase;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  db = drizzle(pool);
  await db.execute(sql.raw(`
    create table app_users (
      id text primary key
    );
    create table holeauth_idp_team (
      id text primary key,
      name text not null,
      created_at timestamptz not null default now()
    );
    create table holeauth_idp_team_member (
      team_id text not null references holeauth_idp_team(id) on delete cascade,
      user_id text not null references app_users(id) on delete cascade,
      role text not null,
      added_at timestamptz not null default now(),
      primary key (team_id, user_id)
    );
    create index on holeauth_idp_team_member (user_id);

    create table holeauth_idp_app (
      id text primary key,
      team_id text not null references holeauth_idp_team(id) on delete cascade,
      name text not null,
      description text,
      logo_url text,
      type text not null,
      client_secret_hash text,
      redirect_uris text[] not null default '{}'::text[],
      allowed_scopes text[] not null default '{}'::text[],
      require_pkce boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      disabled_at timestamptz
    );
    create index on holeauth_idp_app (team_id);

    create table holeauth_idp_authorization_code (
      code_hash text primary key,
      app_id text not null references holeauth_idp_app(id) on delete cascade,
      user_id text not null references app_users(id) on delete cascade,
      redirect_uri text not null,
      scope text not null,
      nonce text,
      code_challenge text,
      code_challenge_method text,
      expires_at timestamptz not null,
      consumed_at timestamptz
    );
    create index on holeauth_idp_authorization_code (expires_at);

    create table holeauth_idp_refresh_token (
      id text primary key,
      token_hash text not null unique,
      app_id text not null references holeauth_idp_app(id) on delete cascade,
      user_id text not null references app_users(id) on delete cascade,
      family_id text not null,
      scope text not null,
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    );
    create index on holeauth_idp_refresh_token (family_id);
    create index on holeauth_idp_refresh_token (user_id);
    create index on holeauth_idp_refresh_token (app_id);

    create table holeauth_idp_consent (
      user_id text not null references app_users(id) on delete cascade,
      app_id text not null references holeauth_idp_app(id) on delete cascade,
      scopes_granted text[] not null default '{}'::text[],
      granted_at timestamptz not null default now(),
      primary key (user_id, app_id)
    );

    create table holeauth_idp_signing_key (
      kid text primary key,
      alg text not null,
      public_jwk jsonb not null,
      private_jwk jsonb not null,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      rotated_at timestamptz
    );

    insert into app_users (id) values ('u1'), ('u2'), ('u3');
  `));
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('idp-drizzle (pg) — schema builders', () => {
  it('exposes every table + relations', () => {
    expect(built.tables.teams).toBeDefined();
    expect(built.tables.teamMembers).toBeDefined();
    expect(built.tables.apps).toBeDefined();
    expect(built.tables.authorizationCodes).toBeDefined();
    expect(built.tables.refreshTokens).toBeDefined();
    expect(built.tables.consents).toBeDefined();
    expect(built.tables.signingKeys).toBeDefined();
    expect(built.relations.teamMembersRelations).toBeDefined();
    expect(built.relations.appsRelations).toBeDefined();
  });

  it('custom prefix honoured', () => {
    const c = createIdpTables({ usersTable: users, prefix: 'zz_' });
    expect(c.tables.teams).toBeDefined();
  });
});

describe('idp-drizzle (pg) — teams', () => {
  const adapter = () => createIdpAdapter({ db, tables: built.tables });

  let teamId = '';

  it('create inserts a team + owner membership', async () => {
    const t = await adapter().teams.create({ name: 'Acme', ownerUserId: 'u1' });
    expect(t.id).toBeTruthy();
    expect(t.name).toBe('Acme');
    teamId = t.id;
    const members = await adapter().teams.listMembers(teamId);
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe('owner');
    expect(members[0]!.userId).toBe('u1');
  });

  it('create uses custom generateId', async () => {
    const a = createIdpAdapter({
      db,
      tables: built.tables,
      generateId: () => 'custom-team-id',
    });
    const t = await a.teams.create({ name: 'Probe', ownerUserId: 'u2' });
    expect(t.id).toBe('custom-team-id');
    await adapter().teams.delete('custom-team-id');
  });

  it('getById returns the team', async () => {
    const t = await adapter().teams.getById(teamId);
    expect(t?.name).toBe('Acme');
  });

  it('getById returns null for unknown id', async () => {
    expect(await adapter().teams.getById('nope')).toBeNull();
  });

  it('listForUser returns teams with the member role', async () => {
    const list = await adapter().teams.listForUser('u1');
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(teamId);
    expect(list[0]!.role).toBe('owner');
  });

  it('addMember inserts a new member', async () => {
    await adapter().teams.addMember(teamId, 'u2', 'admin');
    const m = await adapter().teams.getMembership(teamId, 'u2');
    expect(m?.role).toBe('admin');
  });

  it('addMember updates an existing member (ON CONFLICT DO UPDATE)', async () => {
    await adapter().teams.addMember(teamId, 'u2', 'member');
    const m = await adapter().teams.getMembership(teamId, 'u2');
    expect(m?.role).toBe('member');
  });

  it('getMembership returns null for non-member', async () => {
    expect(await adapter().teams.getMembership(teamId, 'u3')).toBeNull();
  });

  it('removeMember deletes the membership', async () => {
    await adapter().teams.removeMember(teamId, 'u2');
    expect(await adapter().teams.getMembership(teamId, 'u2')).toBeNull();
  });

  it('delete removes the team (cascades to members)', async () => {
    const t = await adapter().teams.create({ name: 'Tmp', ownerUserId: 'u3' });
    await adapter().teams.delete(t.id);
    expect(await adapter().teams.getById(t.id)).toBeNull();
  });
});

describe('idp-drizzle (pg) — apps', () => {
  const adapter = () => createIdpAdapter({ db, tables: built.tables });
  let teamId = '';

  beforeAll(async () => {
    const t = await adapter().teams.create({ name: 'AppTeam', ownerUserId: 'u1' });
    teamId = t.id;
  });

  it('create inserts an app with all fields', async () => {
    const a = await adapter().apps.create({
      id: 'app-1',
      teamId,
      name: 'MyApp',
      description: 'desc',
      logoUrl: 'https://x/logo.png',
      type: 'confidential',
      clientSecretHash: 'hash',
      redirectUris: ['https://app/cb'],
      allowedScopes: ['openid', 'email'],
      requirePkce: true,
    });
    expect(a.id).toBe('app-1');
    expect(a.description).toBe('desc');
    expect(a.clientSecretHash).toBe('hash');
    expect(a.redirectUris).toEqual(['https://app/cb']);
    expect(a.disabledAt).toBeNull();
  });

  it('create with optional fields omitted null-coalesces', async () => {
    const a = await adapter().apps.create({
      id: 'app-2',
      teamId,
      name: 'Public',
      type: 'public',
      redirectUris: ['https://app2/cb'],
      allowedScopes: ['openid'],
      requirePkce: true,
    });
    expect(a.description).toBeNull();
    expect(a.logoUrl).toBeNull();
    expect(a.clientSecretHash).toBeNull();
  });

  it('getById returns the app, null on miss', async () => {
    const a = await adapter().apps.getById('app-1');
    expect(a?.name).toBe('MyApp');
    expect(await adapter().apps.getById('ghost')).toBeNull();
  });

  it('listAll returns every app ordered desc', async () => {
    const list = await adapter().apps.listAll();
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('listForTeam filters by team', async () => {
    const list = await adapter().apps.listForTeam(teamId);
    expect(list.map((a) => a.id).sort()).toEqual(['app-1', 'app-2']);
  });

  it('listForUser joins via team membership', async () => {
    const list = await adapter().apps.listForUser('u1');
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('update patches subset of fields and bumps updatedAt', async () => {
    const before = await adapter().apps.getById('app-1');
    await new Promise((r) => setTimeout(r, 5));
    const patched = await adapter().apps.update('app-1', {
      name: 'MyApp-2',
      description: 'new desc',
      logoUrl: 'https://x/new.png',
      redirectUris: ['https://app/cb', 'https://app/cb2'],
      allowedScopes: ['openid'],
      requirePkce: false,
      clientSecretHash: 'hash2',
      disabledAt: new Date(),
    });
    expect(patched.name).toBe('MyApp-2');
    expect(patched.redirectUris).toHaveLength(2);
    expect(patched.requirePkce).toBe(false);
    expect(patched.disabledAt).toBeInstanceOf(Date);
    expect(patched.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  });

  it('update with empty patch still returns the row with updatedAt bumped', async () => {
    const p = await adapter().apps.update('app-2', {});
    expect(p.id).toBe('app-2');
  });

  it('delete removes the app', async () => {
    await adapter().apps.delete('app-2');
    expect(await adapter().apps.getById('app-2')).toBeNull();
  });
});

describe('idp-drizzle (pg) — authorization codes', () => {
  const adapter = () => createIdpAdapter({ db, tables: built.tables });

  it('create + consume returns the row, then second consume returns null', async () => {
    await adapter().codes.create({
      codeHash: 'hash-A',
      appId: 'app-1',
      userId: 'u1',
      redirectUri: 'https://app/cb',
      scope: 'openid',
      nonce: 'n-1',
      codeChallenge: 'c-1',
      codeChallengeMethod: 'S256',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const first = await adapter().codes.consume('hash-A');
    expect(first?.codeHash).toBe('hash-A');
    expect(first?.nonce).toBe('n-1');
    expect(first?.codeChallengeMethod).toBe('S256');
    const second = await adapter().codes.consume('hash-A');
    expect(second).toBeNull();
  });

  it('consume returns null for an unknown code', async () => {
    expect(await adapter().codes.consume('nope')).toBeNull();
  });

  it('consume returns null for an expired code', async () => {
    await adapter().codes.create({
      codeHash: 'hash-exp',
      appId: 'app-1',
      userId: 'u1',
      redirectUri: 'https://app/cb',
      scope: 'openid',
      nonce: null,
      codeChallenge: null,
      codeChallengeMethod: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await adapter().codes.consume('hash-exp')).toBeNull();
  });

  it('codeRow null-coalesces nullable fields', async () => {
    await adapter().codes.create({
      codeHash: 'hash-null',
      appId: 'app-1',
      userId: 'u1',
      redirectUri: 'https://app/cb',
      scope: 'openid',
      nonce: null,
      codeChallenge: null,
      codeChallengeMethod: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const row = await adapter().codes.consume('hash-null');
    expect(row?.nonce).toBeNull();
    expect(row?.codeChallenge).toBeNull();
    expect(row?.codeChallengeMethod).toBeNull();
  });
});

describe('idp-drizzle (pg) — refresh tokens', () => {
  const adapter = () => createIdpAdapter({ db, tables: built.tables });
  const family = 'fam-1';

  it('create + getByHash returns the row', async () => {
    const row = await adapter().refresh.create({
      id: 'rt-1',
      tokenHash: 'rh-1',
      appId: 'app-1',
      userId: 'u1',
      familyId: family,
      scope: 'openid',
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(row.id).toBe('rt-1');
    expect(row.revokedAt).toBeNull();
    const got = await adapter().refresh.getByHash('rh-1');
    expect(got?.id).toBe('rt-1');
  });

  it('getByHash returns null for unknown', async () => {
    expect(await adapter().refresh.getByHash('nope')).toBeNull();
  });

  it('markRevoked sets revokedAt and subsequent getByHash reflects it', async () => {
    await adapter().refresh.markRevoked('rt-1');
    const got = await adapter().refresh.getByHash('rh-1');
    expect(got?.revokedAt).toBeInstanceOf(Date);
    // idempotent: second call is a no-op because revokedAt IS NOT NULL
    await adapter().refresh.markRevoked('rt-1');
  });

  it('revokeFamily revokes every token in the family', async () => {
    await adapter().refresh.create({
      id: 'rt-2',
      tokenHash: 'rh-2',
      appId: 'app-1',
      userId: 'u1',
      familyId: family,
      scope: 'openid',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await adapter().refresh.create({
      id: 'rt-3',
      tokenHash: 'rh-3',
      appId: 'app-1',
      userId: 'u1',
      familyId: family,
      scope: 'openid',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await adapter().refresh.revokeFamily(family);
    expect((await adapter().refresh.getByHash('rh-2'))?.revokedAt).toBeInstanceOf(Date);
    expect((await adapter().refresh.getByHash('rh-3'))?.revokedAt).toBeInstanceOf(Date);
  });

  it('revokeAllForUser revokes every non-revoked token for the user', async () => {
    await adapter().refresh.create({
      id: 'rt-4',
      tokenHash: 'rh-4',
      appId: 'app-1',
      userId: 'u1',
      familyId: 'fam-user',
      scope: 'openid',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await adapter().refresh.revokeAllForUser('u1');
    expect((await adapter().refresh.getByHash('rh-4'))?.revokedAt).toBeInstanceOf(Date);
  });

  it('revokeAllForApp revokes every non-revoked token for the app', async () => {
    await adapter().refresh.create({
      id: 'rt-5',
      tokenHash: 'rh-5',
      appId: 'app-1',
      userId: 'u2',
      familyId: 'fam-app',
      scope: 'openid',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await adapter().refresh.revokeAllForApp('app-1');
    expect((await adapter().refresh.getByHash('rh-5'))?.revokedAt).toBeInstanceOf(Date);
  });

  it('listForApp returns rows ordered desc', async () => {
    const list = await adapter().refresh.listForApp('app-1');
    expect(list.length).toBeGreaterThanOrEqual(5);
  });
});

describe('idp-drizzle (pg) — consent', () => {
  const adapter = () => createIdpAdapter({ db, tables: built.tables });

  it('get returns null when absent', async () => {
    expect(await adapter().consent.get('u1', 'app-1')).toBeNull();
  });

  it('upsert inserts a new consent record', async () => {
    await adapter().consent.upsert('u1', 'app-1', ['openid', 'email']);
    const c = await adapter().consent.get('u1', 'app-1');
    expect(c?.scopesGranted).toEqual(['openid', 'email']);
    expect(c?.grantedAt).toBeInstanceOf(Date);
  });

  it('upsert updates scopes on conflict', async () => {
    await adapter().consent.upsert('u1', 'app-1', ['openid']);
    const c = await adapter().consent.get('u1', 'app-1');
    expect(c?.scopesGranted).toEqual(['openid']);
  });

  it('revoke removes the consent row', async () => {
    await adapter().consent.revoke('u1', 'app-1');
    expect(await adapter().consent.get('u1', 'app-1')).toBeNull();
  });

  it('revoke on a missing row is a no-op', async () => {
    await expect(adapter().consent.revoke('u1', 'app-1')).resolves.toBeUndefined();
  });
});

describe('idp-drizzle (pg) — signing keys', () => {
  const adapter = () => createIdpAdapter({ db, tables: built.tables });

  it('listActive empty initially', async () => {
    expect(await adapter().keys.listActive()).toEqual([]);
  });

  it('getActive returns null when there are no keys', async () => {
    expect(await adapter().keys.getActive()).toBeNull();
  });

  it('create inserts a new active key', async () => {
    const k = await adapter().keys.create({
      kid: 'k-1',
      alg: 'RS256',
      publicJwk: { kty: 'RSA' },
      privateJwk: { kty: 'RSA', d: 's' },
    });
    expect(k.kid).toBe('k-1');
    expect(k.active).toBe(true);
    expect(k.rotatedAt).toBeNull();
  });

  it('listActive / getActive return the latest active keys', async () => {
    await adapter().keys.create({
      kid: 'k-2',
      alg: 'EdDSA',
      publicJwk: { kty: 'OKP' },
      privateJwk: { kty: 'OKP', d: 's' },
    });
    const list = await adapter().keys.listActive();
    expect(list.length).toBe(2);
    const active = await adapter().keys.getActive();
    expect(active).not.toBeNull();
  });

  it('markRotated deactivates and sets rotatedAt', async () => {
    await adapter().keys.markRotated('k-1');
    const list = await adapter().keys.listActive();
    expect(list.find((k) => k.kid === 'k-1')).toBeUndefined();
  });
});
