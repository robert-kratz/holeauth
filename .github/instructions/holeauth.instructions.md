---
applyTo: "**"
description: "holeauth context for AI agents. Apply to every file in projects that use holeauth for authentication."
---

# holeauth

This project uses [holeauth](https://holeauth.dev) for authentication.

- **Docs:** https://docs.holeauth.dev
- **Search API:** `GET https://docs.holeauth.dev/api/search?q=<term>` — flat `{ id, url, content, type }` list, query before guessing
- **Skills registry:** https://docs.holeauth.dev/skills — SKILL.md files that scaffold and extend holeauth

## Key packages

| Package | Purpose | Docs |
| --- | --- | --- |
| `@holeauth/core` | Auth primitives, JWT, sessions, password, OTP, SSO | https://docs.holeauth.dev/packages/core |
| `@holeauth/adapter-drizzle` | Drizzle ORM adapter (Postgres / MySQL / SQLite) | https://docs.holeauth.dev/packages/adapter-drizzle |
| `@holeauth/nextjs-app-router` | Next.js App Router: route handler, `getSession`, middleware | https://docs.holeauth.dev/getting-started/nextjs-app-router |
| `@holeauth/nextjs-pages-router` | Next.js Pages Router: API handler, `getServerSideSession` | https://docs.holeauth.dev/getting-started/nextjs-pages-router |
| `@holeauth/plugin-2fa` | TOTP two-factor authentication + recovery codes | https://docs.holeauth.dev/packages/plugin-2fa |
| `@holeauth/plugin-passkey` | WebAuthn / FIDO2 passkeys | https://docs.holeauth.dev/packages/plugin-passkey |
| `@holeauth/plugin-rbac` | Role-based access control with YAML policy files | https://docs.holeauth.dev/packages/plugin-rbac |
| `@holeauth/plugin-idp` | Run an OIDC Identity Provider (SSO server) | https://docs.holeauth.dev/packages/plugin-idp |
| `@holeauth/react` | Client hooks: `useSession`, `useAuth` | https://docs.holeauth.dev/packages/react |
| `@holeauth/trpc` | tRPC v11 auth-aware context + RBAC procedures | https://docs.holeauth.dev/integrations/trpc |

## Rules

- Always query the Search API before guessing package APIs or config shapes.
- Never import Node-only modules (e.g. `fs`, `crypto` from Node) into proxy / middleware — holeauth middleware runs on the Edge runtime.
- Pass only `{ secrets: { jwtSecret }, tokens: { cookiePrefix } }` to `holeauthMiddleware` in `proxy.ts` / `middleware.ts`.
- Skills in `.github/skills/` take precedence over general knowledge for scaffolding tasks.
