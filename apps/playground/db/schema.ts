import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createHoleauthTables } from '@holeauth/adapter-drizzle/pg';
import { createRbacTables } from '@holeauth/rbac-drizzle/pg';
import { createTwoFactorTables } from '@holeauth/2fa-drizzle/pg';
import { createPasskeyTables } from '@holeauth/passkey-drizzle/pg';
import { createIdpTables } from '@holeauth/idp-drizzle/pg';

/**
 * Application-owned users table. holeauth NEVER defines this — it's purely
 * the shell/factories that bolt onto this. Add any app-specific columns you
 * like here.
 */
export const users = pgTable('app_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export const core = createHoleauthTables({ usersTable: users });
export const rbacSchema = createRbacTables({ usersTable: users });
export const twoFa = createTwoFactorTables({ usersTable: users });
export const passkeys = createPasskeyTables({ usersTable: users });
export const idpSchema = createIdpTables({ usersTable: users });

export const sessions = core.tables.sessions;
export const accounts = core.tables.accounts;
export const verificationTokens = core.tables.verificationTokens;
export const auditLog = core.tables.auditLog;

export const userGroups = rbacSchema.tables.userGroups;
export const userPermissions = rbacSchema.tables.userPermissions;

export const twoFactor = twoFa.tables.twoFactor;
export const passkeyCredentials = passkeys.tables.passkeys;

export const idpTeams = idpSchema.tables.teams;
export const idpTeamMembers = idpSchema.tables.teamMembers;
export const idpApps = idpSchema.tables.apps;
export const idpAuthorizationCodes = idpSchema.tables.authorizationCodes;
export const idpRefreshTokens = idpSchema.tables.refreshTokens;
export const idpConsents = idpSchema.tables.consents;
export const idpSigningKeys = idpSchema.tables.signingKeys;

export const schema = {
  ...core.tables,
  ...rbacSchema.tables,
  ...twoFa.tables,
  ...passkeys.tables,
  ...idpSchema.tables,
  ...core.relations,
};
