---
name: holeauth-compat-matrix
description: "Generate a timestamped holeauth compatibility matrix as a Markdown report under docs/compat/. Produces two tables: (1) Feature × Framework (Next.js App Router, Next.js Pages Router, Express, Hono) and (2) Drizzle Adapter × Database (Postgres, MySQL, SQLite). Use when: auditing holeauth support status, generating KPI snapshot, tracking compatibility roadmap, reviewing which features work where, compatibility report, support matrix."
argument-hint: "Optional: output folder (default: docs/compat)"
---

# Holeauth Compatibility Matrix

Produces a timestamped Markdown file at `docs/compat/YYYY-MM-DD.md` (or a custom path) containing two compatibility tables derived by reading the live source of all packages in the monorepo.

## When to Use

- Periodic KPI snapshots for the roadmap
- Before a release — confirm no regressions
- After adding a new framework adapter or plugin

---

## Procedure

### Step 1 — Resolve Output Path

Use today's date (`YYYY-MM-DD`) and write to:

```
docs/compat/YYYY-MM-DD.md
```

If the `docs/compat/` directory doesn't exist, create it. Never overwrite an existing file; append a `-2`, `-3` suffix if the date file already exists.

---

### Step 2 — Scan Packages

For every folder under `packages/` in the monorepo root, read in parallel:

| What to read | Where to find it |
|---|---|
| Package name + version | `package.json` → `name`, `version` |
| Peer dependencies | `package.json` → `peerDependencies` |
| Main exports / subpath exports | `package.json` → `exports` |
| Source entry | `src/index.ts` (primary), `src/` directory listing as fallback |

For each package, determine:

- **Framework target**: Look at the package name and source imports. Server framework packages: `nextjs-app-router` (imports `next/headers`, `next/navigation`, `next/server`), `nextjs-pages-router` (imports `next` types like `NextApiRequest`, `GetServerSidePropsContext`), `express` (imports from `express`), `hono` (imports from `hono`). Headless: pure TS/JS with no framework imports.
- **Feature set**: Which auth flows, endpoints, or utilities does the source export? Look for: `signin`, `register`, `password-reset`, `invite`, `twofa`, `passkey`, `rbac`, `idp`, `session`, `middleware`, `sso`, `refresh`, `audit`.
- **Database support**: Does the package have subpath exports `./pg`, `./mysql`, `./sqlite`? List which ones exist as actual source folders.
- **Edge safety**: Does the package use `fs`, `path`, `child_process`, or `@node-rs/*`? → Not edge-safe.

Packages to cover (minimum set):

```
core, nextjs-app-router, nextjs-pages-router, express, hono, react, react-ui, trpc,
plugin-2fa, plugin-passkey, plugin-rbac, plugin-idp,
adapter-drizzle, 2fa-drizzle, passkey-drizzle, rbac-drizzle, idp-drizzle,
rbac-yaml
```

---

### Step 3 — Build Matrix 1: Feature × Framework

Columns: **Next.js App Router** | **Next.js Pages Router** | **Express** | **Hono**

Use these symbol conventions:

| Symbol | Meaning |
|---|---|
| ✅ | First-class support, officially wired |
| ⚠️ | Works but requires manual wiring / no official adapter |
| ❌ | Not supported / architecturally blocked |
| – | Not applicable |

Feature rows (group by section):

**Setup & Routing**
- Auth instance (`createAuthHandler` / `createPagesAuthHandler` / `createExpressAuth` / `createHonoAuth`)
- Route handler (catch-all dispatcher)
- Framework middleware (Next.js middleware / Express middleware / Hono middleware)

**Authentication**
- Email + Password — Login
- Email + Password — Registration
- Password Reset Flow
- Email Verification
- Invite System

**Session**
- JWT Access + Refresh Rotation
- Server-side Session (RSC / SSR)
- Client-side Session (`useSession`)

**2FA / TOTP**
- TOTP Enrollment + Verify
- Recovery Codes
- QR Code Generation
- Rate Limiting (in-memory)

**Passkeys (WebAuthn)**
- Passkey Registration
- Passkey Login
- Credential Management (list/delete)

**RBAC**
- Roles + Permissions (wildcard)
- Group Inheritance
- Direct User Permission Overrides
- Permission Cache (TTL)
- RBAC YAML Configuration
- Client RBAC Snapshot (`useRbac`)

**SSO — Consumer**
- OAuth Provider: Google
- OAuth Provider: GitHub
- OAuth Provider: Discord
- OAuth Provider: Microsoft
- Generic OIDC Consumer

**IDP Server (OAuth2/OIDC)**
- Discovery `/.well-known/openid-configuration`
- JWKS Endpoint
- Authorization Code + PKCE
- Refresh Token Rotation (family-revoke)
- Token Revocation (RFC 7009)
- RP-initiated Logout
- Consent Management
- Signing Key Rotation (RS256)
- Teams / App Registry

**tRPC Integration**
- Auth Context (`createHoleauthContext`)
- Transparent Token Refresh
- RBAC Permission Guard

**Headless UI**
- `SignInForm` / `SignUpForm`
- `PasswordResetRequestForm` / `PasswordChangeForm`
- `TwoFactorVerifyForm`
- `PasskeySetup` / `PasskeyLoginButton`
- `SsoButton` / `SignOutButton`

**Infrastructure**
- Audit Log
- Edge Runtime compatible

**Rating rules** for each cell — derived from Step 2 analysis:
- A feature is ✅ for a framework **only if** the source is wired end-to-end for that framework (no manual adapter needed).
- A feature is ⚠️ if the plugin/core is headless and *could* work in that framework but no official adapter/wrapper exists, OR if the framework binding requires user-supplied glue (e.g., headless UI in non-React frameworks).
- A feature is ❌ if the implementation imports a framework-specific API incompatible with that target (e.g., `next/headers` → blocked in Pages Router, Express, and Hono).
- Use – when the concept does not apply (e.g., React `useSession` hook in Express / Hono SSR).
- For headless UI components (React): mark ✅ for App Router and Pages Router (both render React), and – for Express / Hono (server-only frameworks).

---

### Step 4 — Build Matrix 2: Drizzle Adapter × Database

Columns: **Postgres** | **MySQL** | **SQLite**

Rows: each Drizzle adapter package. A cell is ✅ if a source folder (`src/pg/`, `src/mysql/`, `src/sqlite/`) exists and is non-empty; ❌ otherwise.

---

### Step 5 — Build Roadmap Gap Table

Add a third table: **Roadmap Implications**. Columns: Priority (🔴/🟡/🟢), Gap, Impact. Derive from any ❌ cells in Matrix 1 that represent a high-value framework+feature combination.

Priority rules:
- 🔴 High: Gap blocks adoption in a major ecosystem (e.g., a feature missing in 2+ of the 4 framework columns, non-Postgres IDP)
- 🟡 Medium: Gap limits a specific integration path (e.g., generic OIDC consumer in only one framework)
- 🟢 Low: Nice-to-have or niche

---

### Step 6 — Write the Report

Assemble the report with this exact structure:

```markdown
# Holeauth Compatibility Matrix — YYYY-MM-DD

> Auto-generated by the `holeauth-compat-matrix` skill. All data derived from live monorepo source.
> All packages: vX.Y.Z-alpha.N

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | First-class support |
| ⚠️ | Works, manual wiring required |
| ❌ | Not supported |
| – | Not applicable |

## Matrix 1 — Feature × Framework

<table from Step 3>

## Matrix 2 — Drizzle Adapter × Database

<table from Step 4>

## Roadmap Gaps

<table from Step 5>

## Package Inventory

<one-line-per-package summary: name | version | framework target | headless | edge-safe>
```

Write the file using `create_file`. Do NOT overwrite existing files.

After writing, output the file path and a brief summary of the most critical gaps found.

---

## Quality Criteria

The report is complete when:
- [ ] All packages are represented in the inventory (18+ packages)
- [ ] Matrix 1 has no empty cells (every combination has ✅/⚠️/❌/–) across the 4 framework columns
- [ ] Matrix 2 covers all 5 Drizzle adapter packages × 3 databases
- [ ] Roadmap table has at least one entry per priority level
- [ ] File is saved under `docs/compat/` with today's date
