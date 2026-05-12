---
name: integrate-holeauth-rbac
description: "Add Role-Based Access Control (RBAC) to a holeauth project using @holeauth/plugin-rbac, @holeauth/rbac-drizzle, and @holeauth/rbac-yaml. Use when: adding roles, adding permissions, adding RBAC, adding authorization, protecting routes, restricting access, adding groups, adding user roles, wildcard permissions. Requires integrate-holeauth-core to be completed first."
argument-hint: "Inherits dialect + usersTable from core skill"
---

# Integrate holeauth — RBAC

Adds groups + permissions with wildcard matching and YAML config via `@holeauth/plugin-rbac`.

## Prerequisites

`integrate-holeauth-core` must be complete.

## Source of truth

- Reference auth wiring: `apps/playground/lib/auth.ts` (line `rbac({ adapter: rbacAdapter, groups: rbacYaml.snapshot.groups })`)
- Reference YAML: `apps/playground/holeauth.rbac.yml`
- Docs: `https://docs.holeauth.dev/docs/packages/plugin-rbac`
- Platform-specific enforcement: `https://docs.holeauth.dev/docs/getting-started/<framework>/plugin-rbac`

---

## Procedure

### Step 1 — Interview

| # | Variable | Type | Notes |
|---|---|---|---|
| 1 | `groupSource` | radio | YAML + DB overrides (recommended) · DB only · Static in code |
| 2 | `initialGroups` | multi-select | user · moderator · admin · developer · custom (free text) |
| 3 | `defaultGroup` | radio | Pick from `initialGroups` — auto-assigned on registration |
| 4 | `cacheTtlMs` | number | 5000 (dev) / 30000 (prod) |
| 5 | `hotReload` | radio | Yes (watch YAML file in dev) · No |
| 6 | `enforcementPoints` | multi-select | Server Components · Route Handlers · tRPC procedures · Client hooks |

**Exactly one group must be marked `default: true` in YAML.**

---

### Step 2 — Install

```bash
pnpm add @holeauth/plugin-rbac @holeauth/rbac-drizzle @holeauth/rbac-yaml
```

`@holeauth/rbac-yaml` is Node-only (uses `fs.watch`). Do not import it in edge runtime files.

---

### Step 3 — Schema

Edit `db/schema.ts`:

```ts
import { createRbacTables } from '@holeauth/rbac-drizzle/<dialect>';

export const rbacSchema = createRbacTables({ usersTable: users });
export const userGroups = rbacSchema.tables.userGroups;
export const userPermissions = rbacSchema.tables.userPermissions;

export const schema = {
  ...core.tables,
  ...rbacSchema.tables,
  ...core.relations,
};
```

Run `pnpm db:push`.

---

### Step 4 — YAML

Create `holeauth.rbac.yml` at the project root:

```yaml
##
## Permission grammar:
##   '*'                      wildcard root (everything)
##   'users.edit'             exact node
##   'users.edit.*'           trailing wildcard (matches 'users.edit' and any descendant)
##   '!users.edit.delete'     negation — removes a previously granted node
##
## Exactly ONE group must be marked `default: true`.
## Higher `priority` groups override lower ones.
## `inherits: [other]` pulls in another group's effective permission list.
##
groups:
  user:
    default: true
    displayName: User
    priority: 0
    permissions:
      - profile.read
      - profile.edit.self

  moderator:
    displayName: Moderator
    priority: 10
    inherits: [user]
    permissions:
      - posts.moderate
      - users.read

  admin:
    displayName: Administrator
    priority: 100
    inherits: [moderator]
    permissions:
      - '*'
      - '!admin.delete'
```

---

### Step 5 — Plugin registration

Preferred (one-step factory):

```ts
import path from 'node:path';
import { rbacFromYaml } from '@holeauth/rbac-yaml';
import { createRbacAdapter } from '@holeauth/rbac-drizzle/<dialect>';
import { rbacSchema } from '../db/schema';

const rbacAdapter = createRbacAdapter({ db, tables: rbacSchema.tables });

const rbacPlugin = rbacFromYaml(
  path.join(process.cwd(), 'holeauth.rbac.yml'),
  {
    adapter: rbacAdapter,
    cacheTtlMs: <cacheTtlMs>,
    watch: process.env.NODE_ENV !== 'production',
  },
);

const plugins = [
  rbacPlugin,
  // ...other plugins
] as const;
```

Alternative (manual three-step — use only if `rbacFromYaml` doesn't fit, e.g. multi-tenant):

```ts
import { loadRbacYaml } from '@holeauth/rbac-yaml';
import { rbac } from '@holeauth/plugin-rbac';

const rbacYaml = loadRbacYaml(rbacYmlPath, { watch: true });
const rbacPlugin = rbac({ adapter: rbacAdapter, groups: rbacYaml.snapshot.groups });
rbacYaml.onReload((snap) => rbacPlugin.reload(snap.groups));
```

---

### Step 6 — API surface

```ts
auth.rbac.can(userId, 'posts.edit')                    // → boolean
auth.rbac.canAll(userId, ['a', 'b'])
auth.rbac.canAny(userId, ['a', 'b'])
auth.rbac.listGroups()
auth.rbac.getGroup(id)
auth.rbac.getUserGroups(userId)
auth.rbac.getUserPermissions(userId)
auth.rbac.getEffectiveNodes(userId)
auth.rbac.assignGroup(userId, groupId)
auth.rbac.removeGroup(userId, groupId)
auth.rbac.grant(userId, node)
auth.rbac.revoke(userId, node)
auth.rbac.reload(groups)                               // hot-swap
auth.rbac.snapshot()                                   // → { groups, defaultGroupId }
auth.rbac.listOrphans()                                // assignments pointing at deleted groups
```

---

### Step 7 — Default-group on register

Edit `lib/auth.ts` after the `createAuthHandler` call:

```ts
import { subscribe } from '@holeauth/core/events';

subscribe(auth.config, 'user.registered', async (e) => {
  if (!e.userId) return;
  const { defaultGroupId } = auth.rbac.snapshot();
  if (defaultGroupId) await auth.rbac.assignGroup(e.userId, defaultGroupId);
});

// If using invite system with encoded groupIds:
subscribe(auth.config, 'user.invite_consumed', async (e) => {
  if (!e.userId) return;
  const gids = ((e.data as { groupIds?: unknown } | null | undefined)?.groupIds ?? []) as string[];
  for (const gid of gids) {
    try { await auth.rbac.assignGroup(e.userId, gid); }
    catch (err) { console.error('[holeauth] invite group assign failed', gid, err); }
  }
});
```

---

### Step 8 — Server-side enforcement

Use `auth.rbac.can(userId, 'permission.node')` (or `canAll` / `canAny`) in server-side code to enforce permissions before returning data or rendering content. Unauthorized requests should redirect or return an error response appropriate for the framework.

**This step is platform-specific.** The AI agent implements enforcement guards in the pattern appropriate for `framework`:
- For platform-specific helpers (e.g. `validateCurrentRequest` for Next.js), refer to the platform docs
- Reference server-component guard: `apps/playground/app/admin/page.tsx`

Docs: `https://docs.holeauth.dev/docs/packages/plugin-rbac#enforcement`

---

### Step 9 — Client-side visibility

The `useRbac()` hook from `@holeauth/react` exposes `can`, `canAll`, `canAny` for conditional UI rendering. The hook reads the RBAC permission snapshot lazily on mount — no extra fetch. It requires `<HoleauthProvider>` to be mounted above the component.

**The AI agent adds platform-appropriate permission checks to UI components.** Refer to:
- Docs: `https://docs.holeauth.dev/docs/packages/plugin-rbac#client`
- Reference usage: `apps/playground/app/` (components with RBAC visibility guards)

---

## Hardcoded gotchas

1. **`GroupDefinition.effective` is the fully-resolved permission list.** When emitting groups manually (without `rbac-yaml`), apply `inherits` resolution and negation (`!node`) yourself first.
2. **`auth.rbac.reload()` takes the whole groups array.** It is NOT an event-style listener — call it with the new snapshot.
3. **`rbac-yaml` is Node-only** (`fs.watch`). Never import it in code that runs on the edge runtime.
4. **Negation (`!node`) only removes a node previously granted by a wildcard or inheritance** — it is not a deny rule on its own.
5. **Permission cache TTL** defaults to 5000ms in dev, 30000ms in prod. Cache misses can mask `assignGroup` calls until the TTL expires.
6. **`useRbac()` requires `<HoleauthProvider>`** — and the snapshot is fetched lazily on mount.
7. **Headless `RbacAdapter` interface:** `listUserGroups`, `assignGroup`, `removeGroup`, `listUserPermissions`, `grantPermission`, `revokePermission`, `listAllGroupAssignments`, `purgeUser`.

---

## Verification checklist

```
[ ] DB migration applied after schema change: pnpm db:push
[ ] rbac plugin appears in the plugins array with `as const`
[ ] holeauth.rbac.yml exists at project root with exactly one `default: true` group
[ ] Default group auto-assigned after a new user registers
[ ] auth.rbac.can(userId, 'permission') returns correct boolean
[ ] Server-side enforcement gate redirects unauthorized users
[ ] useRbac() hook returns correct permissions for signed-in user
[ ] pnpm typecheck passes
```

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=rbac+<topic>
```

Useful topics: `wildcard matching`, `inheritance`, `cache invalidation`, `tRPC procedure`, `multi-tenant`.
