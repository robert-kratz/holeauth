# @holeauth/2fa-drizzle

Drizzle adapter for `@holeauth/plugin-2fa`. Subpaths: `/pg`, `/mysql`, `/sqlite`.

```ts
import { createTwoFactorTables, createTwoFactorAdapter } from '@holeauth/2fa-drizzle/pg';
import { users } from '@/db/schema';

export const twofa = createTwoFactorTables({ usersTable: users });
const twoFactorAdapter = createTwoFactorAdapter({ db, tables: twofa.tables });
```
