---
name: holeauth-plugin-design
description: "Design and scaffold a new holeauth plugin package from scratch using definePlugin. Use when: building a custom holeauth plugin, creating a holeauth extension, adding domain-specific auth logic via the plugin system, custom hooks on auth events, custom auth routes, custom auth API surface, custom auth adapter. Slim scaffold + delegation to the docs."
argument-hint: "Optional: plugin name (kebab-case)"
domain: "holeauth, plugins, definePlugin, plugin development, authentication, authorization"
---

# Holeauth Plugin Design

Scaffolds a new plugin package in `packages/<name>/` mirroring the structure of `packages/plugin-2fa/`. If a database-backed adapter is needed, also scaffolds `packages/<name>-drizzle/`.

## When NOT to use

- Integrating an existing plugin → `integrate-holeauth-<name>` skill
- Building a full app → `bootstrap-nextjs-holeauth`

## Source of truth

Implementation rules and the `definePlugin` contract live in the docs. **Read them on demand** rather than embedding them here:

- Architecture: `https://docs.holeauth.dev/docs/plugins/architecture`
- `definePlugin`: `https://docs.holeauth.dev/docs/plugins/define-plugin`
- Hooks: `https://docs.holeauth.dev/docs/plugins/hooks`
- Routes: `https://docs.holeauth.dev/docs/plugins/routes`
- API surface: `https://docs.holeauth.dev/docs/plugins/api-surface`
- Adapter: `https://docs.holeauth.dev/docs/plugins/adapter`
- Tutorial: `https://docs.holeauth.dev/docs/plugins/tutorial`
- Search API: `GET https://docs.holeauth.dev/api/search?q=plugin+<topic>`

Reference implementation (read these source files for patterns, not the docs):

- `packages/plugin-2fa/src/` — simplest plugin with hooks + routes + adapter
- `packages/plugin-passkey/src/` — plugin with peer-dep gating
- `packages/2fa-drizzle/src/` — drizzle adapter pattern

---

## Procedure

### Step 1 — Interview (7 questions)

| # | Variable | Type | Notes |
|---|---|---|---|
| 1 | `pluginName` | text | kebab-case, e.g. `audit-trail`, `magic-link` |
| 2 | `packageScope` | radio | `@yourorg/holeauth-plugin-<name>` (scoped) · unscoped |
| 3 | `hooks` | multi-select | `user.registered` · `user.login` · `user.logout` · `session.created` · `token.rotated` · `user.invite_consumed` · none |
| 4 | `routes` | radio | GET routes only · POST routes only · Both · None |
| 5 | `apiSurface` | text | Free text — list the methods `auth.<pluginKey>.<method>()` should expose (e.g. `enroll(userId)`, `verify(token)`, `disable(userId)`) |
| 6 | `adapter` | radio | Yes (needs DB persistence) · No (in-memory or stateless) |
| 7 | `adapterDialects` | multi-select (if adapter=Yes) | pg · mysql · sqlite |

---

### Step 2 — Fetch the relevant docs sections

**Always:**

```
fetch_webpage('https://docs.holeauth.dev/docs/plugins/architecture')
fetch_webpage('https://docs.holeauth.dev/docs/plugins/define-plugin')
```

**Conditionally:**

- If `hooks !== ['none']`: fetch `/docs/plugins/hooks`
- If `routes !== 'None'`: fetch `/docs/plugins/routes`
- If `adapter === Yes`: fetch `/docs/plugins/adapter`

Do **not** scaffold without reading these — the `definePlugin` API and event payloads have type-level constraints that change between minor versions.

---

### Step 3 — Scaffold the plugin package

Create `packages/<pluginName>/` with this structure:

```
packages/<pluginName>/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── README.md
└── src/
    ├── index.ts        ← barrel exports
    ├── types.ts        ← PluginOptions, PluginAdapter interface
    └── plugin.ts       ← definePlugin() factory
```

**`package.json`** — mirror the shape from `packages/plugin-2fa/package.json`:

```json
{
  "name": "<packageScope>",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist .turbo"
  },
  "peerDependencies": {
    "@holeauth/core": "workspace:*"
  },
  "devDependencies": {
    "@holeauth/core": "workspace:*",
    "@holeauth/tsconfig": "workspace:*",
    "tsup": "^8.3.0",
    "typescript": "^5.6.2"
  }
}
```

**`tsconfig.json`:**

```json
{
  "extends": "@holeauth/tsconfig/base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

**`tsup.config.ts`:** copy verbatim from `packages/plugin-2fa/tsup.config.ts`.

**`src/types.ts`** — minimal skeleton, fill from interview:

```ts
export interface <PluginName>Adapter {
  // ← fill from interview adapter contract
  // Example: getByUserId(userId: string): Promise<Record | null>
}

export interface <PluginName>Options {
  adapter?: <PluginName>Adapter;   // optional if `adapter === No`
  // ← any other tunables
}

export interface <PluginName>Api {
  // ← one entry per item in `apiSurface`
}
```

**`src/plugin.ts`** — scaffold the `definePlugin` call. Read the live signature via `fetch_webpage('https://docs.holeauth.dev/docs/plugins/define-plugin')` before writing this file — the shape changes between releases.

Generic pattern (verify against docs):

```ts
import { definePlugin } from '@holeauth/core';
import type { <PluginName>Options, <PluginName>Api } from './types';

export function <pluginKey>(options: <PluginName>Options) {
  return definePlugin({
    id: '<pluginKey>',
    setup(ctx) {
      // ctx.events.on('user.registered', async (e) => { ... })   // for each selected hook
      // ctx.routes.post('/path', handler)                        // for each route
      return {
        api: {
          // method implementations matching <PluginName>Api
        } satisfies <PluginName>Api,
      };
    },
  });
}
```

**`src/index.ts`:**

```ts
export { <pluginKey> } from './plugin';
export type * from './types';
```

---

### Step 4 — Scaffold the Drizzle adapter (if `adapter === Yes`)

Mirror `packages/2fa-drizzle/` exactly. Per selected dialect, create:

```
packages/<pluginName>-drizzle/
├── package.json     ← subpath exports for ./pg, ./mysql, ./sqlite
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts     ← empty `export {}` (subpaths only)
    ├── pg/
    │   ├── index.ts
    │   ├── schema.ts        ← createTables({ usersTable })
    │   └── adapter.ts       ← createAdapter({ db, tables })
    ├── mysql/   (same shape, only if selected)
    └── sqlite/  (same shape, only if selected)
```

The `package.json` exports field:

```json
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./pg": { "types": "./dist/pg/index.d.ts", "import": "./dist/pg/index.js" },
    "./mysql": { "types": "./dist/mysql/index.d.ts", "import": "./dist/mysql/index.js" },
    "./sqlite": { "types": "./dist/sqlite/index.d.ts", "import": "./dist/sqlite/index.js" }
  }
}
```

Each dialect's `schema.ts` exports a `create<PluginName>Tables({ usersTable })` factory returning `{ tables: { ... } }`. Each `adapter.ts` exports `create<PluginName>Adapter({ db, tables })` returning the `<PluginName>Adapter` interface from the plugin package.

---

### Step 5 — Update workspace config

Edit `pnpm-workspace.yaml` if `packages/*` glob doesn't already cover the new directory — it usually does.

Run from the monorepo root:

```bash
pnpm install
pnpm --filter <packageScope> build
pnpm --filter <packageScope>-drizzle build   # if adapter scaffolded
```

---

### Step 6 — Smoke test

Add the plugin to `apps/playground/lib/auth.ts` (commented at first):

```ts
// import { <pluginKey> } from '<packageScope>';
// const myAdapter = createXAdapter({ db, tables: xSchema.tables });

const plugins = [
  // <pluginKey>({ adapter: myAdapter, ...options }),
  // ...existing plugins
] as const;
```

Run `pnpm typecheck` from the playground — TypeScript should infer `auth.<pluginKey>.<method>()` at the call site.

---

## Hardcoded gotchas

1. **The plugin's `id` (passed to `definePlugin({ id })`) becomes the namespace on `auth`.** `id: 'audit'` → `auth.audit.<method>()`. Pick it carefully — renaming it later is a breaking change for consumers.
2. **NEVER call `auth.on(...)` from inside `definePlugin`.** Use the hooks/events API exposed on the plugin context. Calling `auth.on()` from the setup function creates a circular reference that breaks SSR.
3. **The plugin key in `createAuthHandler({ plugins })` is derived from `definePlugin({ id })`** — they must match. There is no separate `plugins: { [key]: factory() }` map shape; you pass an array and the `id` becomes the key automatically.
4. **`adapter` is conventionally optional in `Options`.** If your plugin needs persistence but no adapter is provided, throw at `setup` time with a clear error — don't silently use a no-op stub.
5. **Peer-dep gating:** if your plugin depends on an optional native package (like `@simplewebauthn/server` for passkeys), declare it in `peerDependenciesMeta` as optional and throw a typed `<PLUGIN>_NOT_CONFIGURED` error at first use rather than failing at import time.
6. **Plugin-level pre-construction methods:** if your plugin needs to be reloaded (like `rbac.reload(groups)`), expose them as methods on the plugin factory return value (not on `auth.<key>`). See `plugin-rbac` for the pattern.

---

## Need more detail?

```
GET https://docs.holeauth.dev/api/search?q=plugin+<topic>
```

Useful topics: `definePlugin`, `setup context`, `route helpers`, `event payloads`, `api surface inference`, `peer dependencies`.

For end-to-end tutorial walkthrough: `https://docs.holeauth.dev/docs/plugins/tutorial`.
