/**
 * Holeauth Drizzle adapters — factory functions for Postgres, MySQL and SQLite.
 *
 * Subpath exports:
 *   import { createHoleauthTables, createHoleauthAdapters } from '@holeauth/adapter-drizzle/pg';
 *   import { ... } from '@holeauth/adapter-drizzle/mysql';
 *   import { ... } from '@holeauth/adapter-drizzle/sqlite';
 *
 * Pass your own `usersTable` (Drizzle table) so auth data cascades from your
 * user model. Ids are foreign-keyed with cascade delete.
 */
export {};
