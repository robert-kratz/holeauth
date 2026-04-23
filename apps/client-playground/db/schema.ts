import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Users of this client app. Identified by the OIDC `sub` claim from the
 * upstream IdP (main playground). Profile snapshot is refreshed on login.
 */
export const clientUsers = pgTable('client_user', {
  id: text('id').primaryKey(), // = sub
  email: text('email'),
  name: text('name'),
  image: text('image'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Local app session. The browser holds only the opaque `id`; tokens stay
 * server-side. `holeauth_*` are the upstream OIDC tokens.
 */
export const clientSessions = pgTable('client_session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => clientUsers.id, { onDelete: 'cascade' }),
  accessToken: text('holeauth_access_token').notNull(),
  refreshToken: text('holeauth_refresh_token'),
  idToken: text('holeauth_id_token'),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(),
  refreshExpiresAt: timestamp('refresh_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const schema = { clientUsers, clientSessions };
