import {
  mysqlTable,
  varchar,
  timestamp,
  int,
  boolean,
  json,
  primaryKey,
  index,
  type MySqlTableWithColumns,
} from 'drizzle-orm/mysql-core';
import { relations, eq, and } from 'drizzle-orm';
import type { RbacAdapter, UserGroupAssignment } from '@holeauth/plugin-rbac';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MysqlUsersTable = MySqlTableWithColumns<any> & { id: any };

export interface CreateRbacTablesOptions<U extends MysqlUsersTable> {
  usersTable: U;
  prefix?: string;
  persistGroups?: boolean;
}

export function createRbacTables<U extends MysqlUsersTable>(opts: CreateRbacTablesOptions<U>) {
  const { usersTable, prefix = 'holeauth_rbac_', persistGroups = false } = opts;
  const p = (s: string) => `${prefix}${s}`;

  const userGroups = mysqlTable(
    p('user_group'),
    {
      userId: varchar('user_id', { length: 191 })
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      groupId: varchar('group_id', { length: 191 }).notNull(),
      assignedAt: timestamp('assigned_at', { fsp: 3 }).notNull().defaultNow(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.userId, t.groupId] }),
      groupIdx: index(`${p('user_group')}_group_idx`).on(t.groupId),
    }),
  );

  const userPermissions = mysqlTable(
    p('user_permission'),
    {
      userId: varchar('user_id', { length: 191 })
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
      node: varchar('node', { length: 191 }).notNull(),
      assignedAt: timestamp('assigned_at', { fsp: 3 }).notNull().defaultNow(),
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
    ? mysqlTable(p('group'), {
        id: varchar('id', { length: 191 }).primaryKey(),
        displayName: varchar('display_name', { length: 191 }),
        description: varchar('description', { length: 512 }),
        priority: int('priority'),
        isDefault: boolean('is_default').notNull().default(false),
        effective: json('effective').$type<string[]>().notNull(),
        permissions: json('permissions').$type<string[]>().notNull(),
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
  // MySQL uses onDuplicateKeyUpdate for idempotent inserts.
  return {
    async listUserGroups(userId) {
      const rows = await db
        .select({ groupId: userGroups.groupId })
        .from(userGroups)
        .where(eq(userGroups.userId, userId));
      return (rows as { groupId: string }[]).map((r) => r.groupId);
    },
    async assignGroup(userId, groupId) {
      await db
        .insert(userGroups)
        .values({ userId, groupId })
        .onDuplicateKeyUpdate({ set: { groupId } });
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
      await db
        .insert(userPermissions)
        .values({ userId, node })
        .onDuplicateKeyUpdate({ set: { node } });
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
