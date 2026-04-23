/**
 * RbacAdapter — storage for per-user group membership and per-user direct
 * permission overrides. Group *definitions* live in the YAML file; only
 * *assignments* (user ↔ group, user ↔ direct-permission) are persisted.
 */
export interface UserGroupAssignment {
  userId: string;
  groupId: string;
  assignedAt?: Date;
}

export interface UserPermissionAssignment {
  userId: string;
  /** A single permission node; may be negated (`!foo.bar`). */
  node: string;
  assignedAt?: Date;
}

export interface RbacAdapter {
  listUserGroups(userId: string): Promise<string[]>;
  assignGroup(userId: string, groupId: string): Promise<void>;
  removeGroup(userId: string, groupId: string): Promise<void>;

  listUserPermissions(userId: string): Promise<string[]>;
  grantPermission(userId: string, node: string): Promise<void>;
  revokePermission(userId: string, node: string): Promise<void>;

  /** Return every (userId, groupId) pair — used for the `listOrphans` query. */
  listAllGroupAssignments(): Promise<UserGroupAssignment[]>;

  /** Bulk remove all direct permissions for a user (on userDelete). */
  purgeUser(userId: string): Promise<void>;
}
