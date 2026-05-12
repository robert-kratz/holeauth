---
name: integrate-holeauth-rbac
description: "Add Role-Based Access Control (RBAC) to a holeauth project using @holeauth/plugin-rbac, @holeauth/rbac-drizzle, and @holeauth/rbac-yaml. Use when: adding roles, adding permissions, adding RBAC, adding authorization, protecting routes, restricting access, adding groups, adding user roles. Requires integrate-holeauth-core to be completed first."
argument-hint: "Requires core setup. Persistence: Drizzle (pg/mysql/sqlite) or headless RbacAdapter."
---

# Integrate holeauth — RBAC (Roles & Permissions)

Covers `@holeauth/plugin-rbac` (factory: `rbac`), `@holeauth/rbac-drizzle` (`createRbacTables`, `createRbacAdapter`), `@holeauth/rbac-yaml` (`loadRbacYaml`).

> **Prerequisite**: `integrate-holeauth-core` already completed.

## Procedure

### Step 1 — Plugin-specific questions

1. **Group definition source** — `rbacSource`
   - `YAML file (holeauth.rbac.yml) + DB assignments` *(recommended)*
   - `DB only — manage groups at runtime`
   - `Static array in code`
2. **Initial roles** — `rbacRoles` — comma-separated, e.g. `user, moderator, developer, admin`. Exactly one MUST be `default: true`.
3. **Default group** — `rbacDefault` — single value from the list above (default `user`).
4. **Permission style** — `rbacStyle` — `Dot-notation tree (profile.read, posts.edit.own)` *(default)* | `Flat (read_profile)` | `Both`.
5. **Cache TTL (ms)** — `rbacCacheTtl` — `5000` (dev default) | `30000` (prod default) | custom.
6. **Hot-reload YAML in dev** — `rbacWatch` — Yes (default) | No.
7. **Where to enforce** — `rbacEnforce` — multi-select: RSC pages / middleware / API routes / tRPC procedures.

### Step 2 — Install

```
@holeauth/plugin-rbac
@holeauth/rbac-drizzle      # if Drizzle
@holeauth/rbac-yaml         # if rbacSource includes YAML
```

### Step 3 — Drizzle schema

```ts title="db/schema.ts"
import { createRbacTables } from '@holeauth/rbac-drizzle/pg';

export const rbacSchema = createRbacTables({ usersTable: users });
export const userGroups       = rbacSchema.tables.userGroups;
export const userPermissions  = rbacSchema.tables.userPermissions;

export const schema = {
  ...core.tables,
  ...rbacSchema.tables,
};
```

### Step 4 — YAML group definitions (if rbacSource = YAML)

```yaml title="holeauth.rbac.yml"
groups:
  user:
    default: true
    displayName: User
    description: Default group for newly registered accounts.
    priority: 0
    permissions:
      - profile.read
      - profile.edit.self
      - posts.read

  moderator:
    displayName: Moderator
    priority: 10
    inherits: [user]
    permissions:
      - posts.moderate
      - users.read
      - users.warn

  admin:
    displayName: Administrator
    priority: 100
    inherits: [moderator]
    permissions:
      - '*'
      - '!admin.delete'        # explicit deny — overrides wildcards
      - admin.users.read
      - admin.users.invite
      - admin.sessions.read
      - admin.sessions.write
```

Permission grammar:
- `path.to.node` — exact match
- `path.*` — wildcard subtree
- `*` — root wildcard (everything)
- `!path.to.node` — negation (always wins)

### Step 5 — Register the plugin (fully-filled)

```ts title="lib/auth.ts"
import path from 'node:path';
import { rbacFromYaml } from '@holeauth/rbac-yaml'; // 1-step factory: loads YAML, wires hot reload
import { createRbacAdapter } from '@holeauth/rbac-drizzle/pg';
import { db } from '../db/client';
import { rbacSchema } from '../db/schema';

const rbacAdapter = createRbacAdapter({ db, tables: rbacSchema.tables });

export const auth = createAuthHandler({
  // ...existing config
  plugins: [
    rbacFromYaml(path.join(process.cwd(), 'holeauth.rbac.yml'), {
      adapter: rbacAdapter,
      cacheTtlMs: process.env.NODE_ENV === 'production' ? 30_000 : 5_000,
      watch: process.env.NODE_ENV !== 'production',
      // cache: customRbacCacheAdapter,
    }),
  ],
});
// No separate onReload() wiring needed — rbacFromYaml() handles hot reload internally.
```

> **3-step alternative** (if you need `loadRbacYaml` directly):
> ```ts
> import { loadRbacYaml } from '@holeauth/rbac-yaml';
> import { rbac } from '@holeauth/plugin-rbac';
> const yaml = loadRbacYaml(rbacYmlPath, { watch: true });
> const plugin = rbac({ adapter: rbacAdapter, groups: yaml.snapshot.groups });
> yaml.onReload((snap) => plugin.reload(snap.groups)); // ⚠ NOT .on('change') — use .onReload()
> ```

### Step 6 — API surface (`auth.rbac`)

```ts
await auth.rbac.can(userId, 'posts.edit.own');
await auth.rbac.canAll(userId, ['posts.read', 'posts.edit.own']);
await auth.rbac.canAny(userId, ['admin.read', 'moderator.read']);

auth.rbac.listGroups();
auth.rbac.getGroup('admin');

await auth.rbac.getUserGroups(userId);
await auth.rbac.getUserPermissions(userId);
await auth.rbac.getEffectiveNodes(userId);

await auth.rbac.assignGroup(userId, 'admin');
await auth.rbac.removeGroup(userId, 'admin');
await auth.rbac.grant(userId, 'posts.delete');
await auth.rbac.revoke(userId, 'posts.delete');

auth.rbac.reload(newGroups);
auth.rbac.snapshot();
```

### Step 7 — Default-group on register

The plugin emits no automatic default-group assignment unless wired. Add it once:

```ts
// ⚠ Use auth.on() to avoid barrel/subpath WeakMap split.
// ⚠ Event is 'user.registered' (NOT 'user.created').
auth.on('user.registered', async (e) => {
  if (!e.userId) return;
  const def = auth.rbac.listGroups().find((g) => g.default);
  if (def) await auth.rbac.assignGroup(e.userId, def.id);
});

auth.on('user.invite_consumed', async (e) => {
  const ids = ((e.data as { groupIds?: string[] } | null)?.groupIds ?? []) as string[];
  for (const id of ids) await auth.rbac.assignGroup(e.userId!, id);
});
```

### Step 8 — Server-side enforcement

```ts title="app/admin/page.tsx"
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

export default async function AdminPage() {
  const { session, permissions } = await validateCurrentRequest(auth, {
    permissions: ['admin.read'],
    redirectTo: '/login',
  });
  return <div>Hi {session.userId}</div>;
}
```

OR semantics: `anyPermission: ['admin.read', 'moderator.read']`.

### Step 9 — Client-side checks

```tsx
'use client';
import { useRbac } from '@holeauth/react';

export function EditButton() {
  const { can } = useRbac();
  return can('posts.edit.own') ? <button>Edit</button> : null;
}
```

### Step 10 — tRPC integration (if enabled)

The `integrate-holeauth-trpc` skill exposes a `permissionProcedure(node | node[], 'all' | 'any')` middleware that calls `auth.rbac.canAll/canAny`. No additional wiring needed.

### Step 11 — Verify

- Default group auto-assigned on register.
- `auth.rbac.can(userId, 'admin.read')` is `true` for admin members, `false` for default users.
- Wildcards + negations behave per spec.
- Editing `holeauth.rbac.yml` in dev triggers hot reload.

## Headless variant

Implement `RbacAdapter` from `@holeauth/plugin-rbac`:
```ts
interface RbacAdapter {
  listUserGroups(userId: string): Promise<string[]>;
  assignGroup(userId: string, groupId: string): Promise<void>;
  removeGroup(userId: string, groupId: string): Promise<void>;
  listUserPermissions(userId: string): Promise<string[]>;
  grantPermission(userId: string, node: string): Promise<void>;
  revokePermission(userId: string, node: string): Promise<void>;
  listAllGroupAssignments(): Promise<UserGroupAssignment[]>;
  purgeUser(userId: string): Promise<void>;
}
```

## Key references

- `packages/plugin-rbac/src/index.ts` — `RbacOptions`, `RbacApi`
- `packages/rbac-yaml/src/` — `loadRbacYaml`, `ResolvedGroup`
- `packages/rbac-drizzle/src/{pg,mysql,sqlite}/index.ts`
- `apps/playground/holeauth.rbac.yml`
