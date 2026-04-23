# @holeauth/adapter-drizzle

Drizzle factory adapters for holeauth core — Postgres, MySQL, SQLite.

## Install

```bash
pnpm add @holeauth/adapter-drizzle drizzle-orm
```

## Usage (Postgres)

```ts
// db/schema.ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createHoleauthTables } from '@holeauth/adapter-drizzle/pg';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  passwordHash: text('password_hash'),
});

export const holeauth = createHoleauthTables({ usersTable: users });
```

```ts
// lib/auth.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { createHoleauthAdapters } from '@holeauth/adapter-drizzle/pg';
import { users, holeauth } from '@/db/schema';

const db = drizzle(process.env.DATABASE_URL!);
const adapters = createHoleauthAdapters({ db, tables: holeauth.tables });
```

## Subpath exports

- `@holeauth/adapter-drizzle/pg`
- `@holeauth/adapter-drizzle/mysql`
- `@holeauth/adapter-drizzle/sqlite`

## Notes

- `usersTable` is caller-owned; `id` column drives cascade-delete FKs.
- No migrations shipped. Use `drizzle-kit push` or generate migrations yourself.
- `transaction.run` wraps `db.transaction` — multi-step writes become atomic.
