---
name: integrate-holeauth-rbac
description: "Add Role-Based Access Control (RBAC) to a holeauth project using @holeauth/plugin-rbac, @holeauth/rbac-drizzle, and @holeauth/rbac-yaml. Use when: adding roles, adding permissions, adding RBAC, adding authorization, protecting routes, restricting access, adding groups, adding user roles. Requires integrate-holeauth-core to be completed first."
argument-hint: "Requires core setup. Database dialect: PostgreSQL / MySQL / SQLite"
---

# Integrate holeauth — RBAC (Roles & Permissions)

Covers `@holeauth/plugin-rbac`, `@holeauth/rbac-drizzle`, `@holeauth/rbac-yaml`.

> **Prerequisite**: Core setup must be complete (`integrate-holeauth-core`). If not done yet, load that skill first.

## Procedure

### Step 1 — Clarify requirements

Use `vscode/askQuestions` to ask:

1. **Database dialect** — Which database are you using?
   - Options: PostgreSQL, MySQL, SQLite

2. **Group definition storage** — Where should role/group definitions live?
   - Options: YAML file (`holeauth.rbac.yml`) — human-readable, version-controlled (recommended), Database only — manage groups via API at runtime, Both — YAML defines base groups, DB persists user assignments

3. **Default role** — What role should new users receive by default?
   - Free text — e.g. `user`, `member`, `guest`. One role must be marked `default: true`.

4. **Initial roles** — List the roles you need (comma-separated)
   - e.g. `user, moderator, admin`
   - *The agent will scaffold permission trees for each.*

5. **Permission style** — How do you want to express permissions?
   - Options: Dot-notation paths (`profile.read`, `posts.edit.own`), Flat strings (`read_profile`, `edit_post`), Both

6. **Server-side enforcement** — Where do you need to check permissions?
   - Options (multi-select): Next.js page components (RSC), Middleware, API route handlers, All of the above

### Step 2 — Install

```
@holeauth/plugin-rbac
@holeauth/rbac-drizzle
@holeauth/rbac-yaml          # only if using YAML-based group definitions
```

### Step 3 — Extend Drizzle schema

```ts title="db/schema.ts"
import { createRbacTables } from '@holeauth/rbac-drizzle/pg'; // swap dialect

const rbac = createRbacTables({ usersTable: users });

export const schema = {
  ...core.tables,
  ...rbac.tables,
};
```

Run migrations after this change.

### Step 4 — Define groups (YAML)

If using YAML, create `holeauth.rbac.yml` at the project root.  
Scaffold based on the roles the user listed in Step 1:

```yaml title="holeauth.rbac.yml"
groups:
  user:
    default: true
    displayName: User
    priority: 0
    permissions:
      - profile.read
      - profile.edit.self
  admin:
    displayName: Admin
    priority: 100
    inherits:
      - user
    permissions:
      - '*'
      - '!admin.delete'   # negation: block specific permission
```

Permission format:
- `path.to.node` — exact match
- `path.*` — wildcard subtree
- `*` — all permissions
- `!path.to.node` — explicit deny (takes precedence)

### Step 5 — Register the plugin

```ts title="lib/auth.ts"
import { rbacPlugin } from '@holeauth/plugin-rbac';
import { drizzleRbacAdapter } from '@holeauth/rbac-drizzle/pg'; // swap dialect
import { loadRbacYaml } from '@holeauth/rbac-yaml';
import { db } from '@/db';

const groups = await loadRbacYaml('./holeauth.rbac.yml');

export const auth = defineHoleauth({
  // ...existing config
  plugins: [
    rbacPlugin({
      adapter: drizzleRbacAdapter(db),
      groups,           // omit if using DB-only group management
    }),
  ],
});
```

`loadRbacYaml` watches the file for changes in development (hot reload).

### Step 6 — API surface (server-side)

```ts
// Permission checks
const ok = await auth.rbac.can(userId, 'posts.edit.own');
const okAll = await auth.rbac.canAll(userId, ['posts.read', 'posts.edit.own']);
const okAny = await auth.rbac.canAny(userId, ['admin.read', 'moderator.read']);

// Group management
const groups = await auth.rbac.listGroups();
await auth.rbac.assignGroup(userId, 'admin');
await auth.rbac.removeGroup(userId, 'admin');
await auth.rbac.getUserGroups(userId);

// Fine-grained permission grants (per-user, outside groups)
await auth.rbac.grant(userId, 'posts.delete');
await auth.rbac.revoke(userId, 'posts.delete');
```

### Step 7 — Server-side page protection (Next.js RSC)

Use `validateCurrentRequest` from `@holeauth/nextjs`:

```ts title="app/admin/page.tsx"
import { validateCurrentRequest } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
  const { session, permissions } = await validateCurrentRequest(auth, {
    permissions: ['admin.read'],   // redirect if not satisfied
    redirectTo: '/login',
  });

  return <div>Welcome, admin</div>;
}
```

For `anyPermission` (OR semantics): `anyPermission: ['admin.read', 'moderator.read']`.

### Step 8 — Client-side permission checks

```tsx
import { useRbac } from '@holeauth/react';

function EditButton({ postId }: { postId: string }) {
  const { can } = useRbac();
  if (!can('posts.edit.own')) return null;
  return <button>Edit</button>;
}
```

`useRbac()` requires `<AuthenticatedProvider value={validatedResult}>` from a parent RSC.

### Step 9 — Verify

- Assign a user to the `admin` group: `auth.rbac.assignGroup(userId, 'admin')`.
- Verify `auth.rbac.can(userId, 'admin.read')` returns `true`.
- Verify a plain `user` gets `false` for `admin.read`.
- Visit a protected page as `admin` — should render. As `user` — should redirect.
- Test wildcard `*` permission: admin should pass any `can()` check except negated ones.

## Key references

- Plugin source: `packages/plugin-rbac/src/`
- YAML loader: `packages/rbac-yaml/src/`
- Drizzle adapter: `packages/rbac-drizzle/src/`
- Playground RBAC YAML: `apps/playground/holeauth.rbac.yml`
- Playground protected routes: `apps/playground/app/admin/`
