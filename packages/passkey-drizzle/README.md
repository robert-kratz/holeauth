# @holeauth/passkey-drizzle

Drizzle adapter for `@holeauth/plugin-passkey`. Subpaths: `/pg`, `/mysql`, `/sqlite`.

```ts
import { createPasskeyTables, createPasskeyAdapter } from '@holeauth/passkey-drizzle/pg';
import { users } from '@/db/schema';

export const pk = createPasskeyTables({ usersTable: users });
const passkeyAdapter = createPasskeyAdapter({ db, tables: pk.tables });
```
