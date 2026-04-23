import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  type SQLiteTableWithColumns,
} from 'drizzle-orm/sqlite-core';
import { relations, eq, and } from 'drizzle-orm';
import type { RbacAdapter, UserGroupAssignment } from '@holeauth/plugin-rbac';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqliteUsersTable = SQLiteTableWithColumns<any> & { id: any };

export interface CreateRbacTablesOptions<U extends SqliteUsersTable> {
  usersTable: U;
  prefix?: string;
  persistGroups?: boolean;
}

export function createRbacTables<U extends SqliteUsersTable>(opts: CreateRbacTablesOptions<U>) {
  const { usersTable, prefix = 'holeauth_rbac_', persistGroups = false } = opts;
  const p = (s: string) => `${prefix}${s}`;

  const userGroups = sqliteTable(
    p('user_group'),
    {
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      groupId: text('group_id').notNull(),
      assignedAt: integer('assigned_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date()),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.userId, t.groupId] }),
      groupIdx: index(`${p('user_group')}_group_idx`).on(t.groupId),
    }),
  );

  const userPermissions = sqliteTable(
    p('user_permission'),
    {
      userId: text('user_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      node: text('node').notNull(),
      assignedAt: integer('assigned_at', { mode: 'timestamp_ms' })
        .notNull()
        .$defaultFn(() => new Date()),
    },
    (t) => ({ pk: primaryKey({ columns: [t.userId, t.node] }) }),
  );

  const userGroupsRelations = relations(userGroups, ({ one }) => ({
    user: one(usersTable, { fields: [userGroups.userId], references: [usersTable.id] }),
  }));
  const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
    user: one(usersTable, { fields: [userPermissions.userId], references: [usersTable.id] }),
  }));

  const groups = persistGroups
    ? sqliteTable(p('group'), {
        id: text('id').primaryKey(),
        displayName: text('display_name'),
        description: text('description'),
        priority: integer('priority'),
        isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
        effective: text('effective', { mode: 'json' }).$type<string[]>().notNull().default([]),
        permissions: text('permissions', { mode: 'json' }).$type<string[]>().notNull().default([]),
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
