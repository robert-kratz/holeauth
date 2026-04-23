import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  primaryKey,
  index,
  type PgTableWithColumns,
} from 'drizzle-orm/pg-core';
import { relations, eq, and } from 'drizzle-orm';
import type { RbacAdapter, UserGroupAssignment } from '@holeauth/plugin-rbac';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PgUsersTable = PgTableWithColumns<any> & { id: any };

export interface CreateRbacTablesOptions<U extends PgUsersTable> {
  usersTable: U;
  /** Prefix for rbac tables. Default `holeauth_rbac_`. */
  prefix?: string;
  /** Also persist group definitions (opt-in). Default `false` — groups come from YAML. */
  persistGroups?: boolean;
}

export function createRbacTables<U extends PgUsersTable>(opts: CreateRbacTablesOptions<U>) {
  const { usersTable, prefix = 'holeauth_rbac_', persistGroups = false } = opts;
  const p = (s: string) => `${prefix}${s}`;

  const userGroups = pgTable(
    p('user_group'),
    {
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      groupId: text('group_id').notNull(),
      assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.userId, t.groupId] }),
      groupIdx: index().on(t.groupId),
    }),
  );

  const userPermissions = pgTable(
    p('user_permission'),
    {
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      node: text('node').notNull(),
      assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.userId, t.node] }),
    }),
  );

  const userGroupsRelations = relations(userGroups, ({ one }) => ({
    user: one(usersTable, { fields: [userGroups.userId], references: [usersTable.id] }),
  }));
  const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
    user: one(usersTable, { fields: [userPermissions.userId], references: [usersTable.id] }),
  }));

  const groups = persistGroups
    ? pgTable(p('group'), {
        id: text('id').primaryKey(),
        displayName: text('display_name'),
        description: text('description'),
        priority: integer('priority'),
        isDefault: boolean('is_default').notNull().default(false),
        effective: text('effective').array().notNull().default([]),
        permissions: text('permissions').array().notNull().default([]),
      })
    : undefined;

  return {
    tables: {
      userGroups,
      userPermissions,
      ...(groups ? { groups } : {}),
    } as {
      userGroups: typeof userGroups;
      userPermissions: typeof userPermissions;
      groups?: NonNullable<typeof groups>;
    },
    relations: { userGroupsRelations, userPermissionsRelations },
  };
}

type RbacTables = ReturnType<typeof createRbacTables>['tables'];

export interface CreateRbacAdapterOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  tables: RbacTables;
}

export function createRbacAdapter(opts: CreateRbacAdapterOptions): RbacAdapter {
  const { db, tables } = opts;
  const { userGroups, userPermissions } = tables;

  return {
    async listUserGroups(userId) {
      const rows = await db
        .select({ groupId: userGroups.groupId })
        .from(userGroups)
        .where(eq(userGroups.userId, userId));
      return (rows as { groupId: string }[]).map((r) => r.groupId);
    },
    async assignGroup(userId, groupId) {
      await db.insert(userGroups).values({ userId, groupId }).onConflictDoNothing();
    },
    async removeGroup(userId, groupId) {
      await db
        .delete(userGroups)
        .where(and(eq(userGroups.userId, userId), eq(userGroups.groupId, groupId)));
    },
    async listUserPermissions(userId) {
      const rows = await db
        .select({ node: userPermissions.node })
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId));
      return (rows as { node: string }[]).map((r) => r.node);
    },
    async grantPermission(userId, node) {
      await db.insert(userPermissions).values({ userId, node }).onConflictDoNothing();
    },
    async revokePermission(userId, node) {
      await db
        .delete(userPermissions)
        .where(and(eq(userPermissions.userId, userId), eq(userPermissions.node, node)));
    },
    async listAllGroupAssignments() {
      const rows = await db.select().from(userGroups);
      return (rows as { userId: string; groupId: string; assignedAt: Date }[]).map(
        (r): UserGroupAssignment => ({
          userId: r.userId,
          groupId: r.groupId,
          assignedAt: r.assignedAt,
        }),
      );
    },
    async purgeUser(userId) {
      await db.delete(userPermissions).where(eq(userPermissions.userId, userId));
      await db.delete(userGroups).where(eq(userGroups.userId, userId));
    },
  };
}
