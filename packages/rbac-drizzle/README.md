# @holeauth/rbac-drizzle

Drizzle adapter implementation of the `RbacAdapter` interface from `@holeauth/plugin-rbac`.

## Install

```bash
pnpm add @holeauth/rbac-drizzle drizzle-orm
```

## Usage (Postgres)

```ts
import { createRbacTables, createRbacAdapter } from '@holeauth/rbac-drizzle/pg';
import { users } from '@/db/schema';

export const rbac = createRbacTables({ usersTable: users });
// → tables.userGroups, tables.userPermissions, (tables.groups if persistGroups: true)

const rbacAdapter = createRbacAdapter({ db, tables: rbac.tables });
```

Subpaths: `@holeauth/rbac-drizzle/pg | /mysql | /sqlite`.

## Notes

- Groups themselves are defined in YAML via `@holeauth/rbac-yaml`; only user↔group assignments and user↔permission overrides are stored.
- Pass `persistGroups: true` to also create a `group` table for admin UIs that want to persist edits.
- Cascade-delete from your users table wipes assignments automatically.
