import path from 'node:path';
import { createAuthHandler } from '@holeauth/nextjs';
import { subscribe } from '@holeauth/core/events';
import { loadRbacYaml } from '@holeauth/rbac-yaml';
import { createHoleauthAdapters } from '@holeauth/adapter-drizzle/pg';
import { createRbacAdapter } from '@holeauth/rbac-drizzle/pg';
import { createTwoFactorAdapter } from '@holeauth/2fa-drizzle/pg';
import { createPasskeyAdapter } from '@holeauth/passkey-drizzle/pg';
import { createIdpAdapter } from '@holeauth/idp-drizzle/pg';
import { GoogleProvider, GithubProvider } from '@holeauth/core/sso';
import { twofa } from '@holeauth/plugin-2fa';
import { passkey } from '@holeauth/plugin-passkey';
import { rbac } from '@holeauth/plugin-rbac';
import { idp } from '@holeauth/plugin-idp';
import { db } from '../db/client';
import { core, rbacSchema, twoFa, passkeys, idpSchema } from '../db/schema';

/* ───────────────────────── Drizzle-backed adapters ───────────────────────── */

const holeauth = createHoleauthAdapters({ db, tables: core.tables });
const rbacAdapter = createRbacAdapter({ db, tables: rbacSchema.tables });
const twoFactorAdapter = createTwoFactorAdapter({ db, tables: twoFa.tables });
const passkeyPluginAdapter = createPasskeyAdapter({ db, tables: passkeys.tables });
const idpPluginAdapter = createIdpAdapter({ db, tables: idpSchema.tables });

/* ───────────────────────── SSO providers ───────────────────────── */

const providers = [];
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${process.env.APP_URL ?? 'http://localhost:3000'}/api/auth/callback/google`,
    }),
  );
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  providers.push(
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      redirectUri: `${process.env.APP_URL ?? 'http://localhost:3000'}/api/auth/callback/github`,
    }),
  );
}

/* ───────────────────────── Plugins ───────────────────────── */

const rbacYmlPath = path.join(process.cwd(), 'holeauth.rbac.yml');
const rbacYaml = loadRbacYaml(rbacYmlPath, { watch: process.env.NODE_ENV !== 'production' });

const plugins = [
  twofa({ adapter: twoFactorAdapter, issuer: 'Holeauth Playground' }),
  passkey({
    adapter: passkeyPluginAdapter,
    rpID: process.env.PASSKEY_RP_ID ?? 'localhost',
    rpName: process.env.PASSKEY_RP_NAME ?? 'Holeauth Playground',
    rpOrigin: process.env.APP_URL ?? 'http://localhost:3000',
  }),
  rbac({ adapter: rbacAdapter, groups: rbacYaml.snapshot.groups }),
  idp({
    adapter: idpPluginAdapter,
    issuer: `${process.env.APP_URL ?? 'http://localhost:3000'}/api/auth`,
  }),
] as const;

/* ───────────────────────── Auth ───────────────────────── */

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export const auth = createAuthHandler({
  secrets: { jwtSecret: process.env.HOLEAUTH_SECRET ?? 'dev-secret-change-me-please' },
  adapters: {
    user: holeauth.user,
    session: holeauth.session,
    account: holeauth.account,
    auditLog: holeauth.auditLog,
    verificationToken: holeauth.verificationToken,
    transaction: holeauth.transaction,
  },
  providers,
  plugins,
  tokens: { cookiePrefix: 'holeauth' },
  allowDangerousEmailAccountLinking: false,
  registration: {
    selfServe: process.env.REGISTRATION_SELF_SERVE !== 'false',
    inviteTtlSeconds: 7 * 24 * 60 * 60, // 7 days
    inviteUrl: ({ token }) =>
      `${APP_URL}/register/accept?token=${encodeURIComponent(token)}`,
  },
  onEvent: (e) => {
    // eslint-disable-next-line no-console
    console.log('[holeauth:event]', e.type, { userId: e.userId, sid: e.sessionId, data: e.data });
  },
});

/* ───────────────────────── Invite-driven group assignment ───────────────────────── */
/**
 * When a user accepts an invite that encoded `groupIds`, assign those RBAC groups.
 * Core stays plugin-agnostic; the playground bridges the event to the rbac plugin here.
 */
subscribe(auth.config, 'user.invite_consumed', async (e) => {
  const userId = e.userId;
  if (!userId) return;
  const gids = ((e.data as { groupIds?: unknown } | null | undefined)?.groupIds ?? []) as string[];
  for (const gid of gids) {
    try {
      await auth.rbac.assignGroup(userId, gid);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[holeauth] invite group assign failed', gid, err);
    }
  }
});
