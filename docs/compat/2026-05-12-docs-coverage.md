# Documentation Coverage Report — 2026-05-12

Generated: 2026-05-12  
Scope: All `@holeauth/*` packages vs. docs under `apps/docs/content/`  
Total packages audited: 20 (18 public, 2 private)  
Total .mdx files scanned: 79

---

## Packages Audited

| # | Package | Visibility |
|---|---------|-----------|
| 1 | `@holeauth/core` | public |
| 2 | `@holeauth/adapter-drizzle` | public |
| 3 | `@holeauth/2fa-drizzle` | public |
| 4 | `@holeauth/passkey-drizzle` | public |
| 5 | `@holeauth/rbac-drizzle` | public |
| 6 | `@holeauth/idp-drizzle` | public |
| 7 | `@holeauth/plugin-2fa` | public |
| 8 | `@holeauth/plugin-passkey` | public |
| 9 | `@holeauth/plugin-rbac` | public |
| 10 | `@holeauth/plugin-idp` | public |
| 11 | `@holeauth/rbac-yaml` | public |
| 12 | `@holeauth/react` | public |
| 13 | `@holeauth/react-ui` | public |
| 14 | `@holeauth/nextjs-app-router` | public |
| 15 | `@holeauth/nextjs-pages-router` | public |
| 16 | `@holeauth/express` | public |
| 17 | `@holeauth/hono` | public |
| 18 | `@holeauth/trpc` | public |
| 19 | `@holeauth/eslint-config` | private |
| 20 | `@holeauth/tsconfig` | private |

---

## Critical Gaps Summary

### 🔴 Completely Missing Documentation

| Package / Export | Issue |
|-----------------|-------|
| `@holeauth/trpc` | **No dedicated documentation page at all.** Only mentioned in README code snippets. Needs full API reference. |
| `@holeauth/core` → `@holeauth/core/flows` | High-level auth flow module (`register`, `signIn`, `signOut` flows) not documented anywhere. |
| `@holeauth/core` → `@holeauth/core/cookies` | Cookie utilities (`cookieName`, `parseCookies`) not exposed in docs. |

### 🟠 Partially Documented (Sparse / Reference-Only)

| Package / Export | What's Missing |
|----------------|---------------|
| `@holeauth/plugin-idp` | Team management, multi-tenant patterns, `claimsForUser` customization, signing key rotation guide, advanced scope management |
| `@holeauth/rbac-yaml` | CLI tool `holeauth-rbac-codegen` completely undocumented; code generation output patterns; custom schema validation |
| `@holeauth/react` | Invite system hooks (`useAcceptInvite`, `useRejectInvite`) documented but minimal; `useAuditLog` documented but sparse; advanced error handling patterns missing |
| `@holeauth/react-ui` | Styling/customization guide missing; custom error boundary patterns; accessibility / ARIA attribute guidance |
| `@holeauth/nextjs-app-router` | Middleware configuration lacks comprehensive examples; `DispatchOptions` reference not explained |
| `@holeauth/nextjs-pages-router` | `getServerSideProps` redirect patterns; tRPC integration (link only, no example) |
| `@holeauth/plugin-2fa` | Recovery code management utilities (`downloadRecoveryCodesAsTxt`, `formatRecoveryCodesAsText`, `recoveryCodesToBlob`) not documented; distributed rate limiter patterns |
| `@holeauth/plugin-passkey` | Full credential options and transports list; custom attestation validation strategies |
| `@holeauth/plugin-rbac` | Cache adapter implementation patterns; custom permission matching strategies |
| `@holeauth/hono` | Hono context variable type safety patterns; integration with Hono's built-in middleware stack |
| `@holeauth/express` | Error handling middleware patterns; custom session serialization |
| `@holeauth/core` | Complete error type catalog (`InvalidCredentialsError`, `InvalidTokenError`, etc.) not listed; `@holeauth/core/plugins` detailed plugin authoring API |

### 🟡 Documented Indirectly (Different Location Than Expected)

| Export | Actual Location |
|--------|----------------|
| `@holeauth/core/adapters` interfaces | `concepts/adapters.mdx` (not in `packages/core.mdx`) |
| `@holeauth/core/events` | `concepts/events.mdx` (not in `packages/core.mdx`) |
| `@holeauth/trpc` helpers | Framework pages only (linked, not dedicated) |

---

## Coverage Details by Package

### `@holeauth/core`

**Exported sub-paths:** `types`, `errors`, `jwt`, `session`, `password`, `otp`, `sso`, `adapters`, `cookies`, `events`, `flows`, `plugins`

| Sub-path | Documented? | Location |
|----------|------------|----------|
| `@holeauth/core/jwt` | ✅ | `packages/core.mdx` |
| `@holeauth/core/session` | ✅ | `packages/core.mdx` |
| `@holeauth/core/password` | ✅ | `packages/core.mdx` |
| `@holeauth/core/otp` | ✅ | `packages/core.mdx` |
| `@holeauth/core/sso` | ✅ | `packages/core.mdx` |
| `@holeauth/core/adapters` | ⚠️ Indirect | `concepts/adapters.mdx` |
| `@holeauth/core/events` | ⚠️ Indirect | `concepts/events.mdx` |
| `@holeauth/core/cookies` | ❌ Missing | — |
| `@holeauth/core/flows` | ❌ Missing | — |
| `@holeauth/core/plugins` | ❌ Missing | — |
| Error types catalog | ❌ Missing | — |
| `defineHoleauth` config reference | ⚠️ Partial | `packages/core.mdx` |

---

### `@holeauth/adapter-drizzle`

**Exported sub-paths:** `/pg`, `/mysql`, `/sqlite`  
**Key exports per dialect:** `createHoleauthTables`, `createHoleauthAdapters`, table types

| Symbol | Documented? |
|--------|------------|
| `createHoleauthTables` | ✅ |
| `createHoleauthAdapters` | ✅ |
| Dialect-specific table types | ⚠️ Not enumerated |
| Custom transaction handling | ❌ Missing |
| Migration guide | ❌ Missing |

---

### `@holeauth/plugin-2fa` + `@holeauth/2fa-drizzle`

**Key exports:** `twofa()`, `TwoFactorAdapter`, `TwoFactorApi`, `generateRecoveryCodes`, `verifyTotp`, `buildOtpauthUrl`, `createMemoryRateLimiter`, `twoFactorRateLimitedError`

| Symbol | Documented? |
|--------|------------|
| `twofa()` factory | ✅ |
| `TwoFactorAdapter` interface | ✅ |
| `TwoFactorApi` methods | ✅ |
| `generateRecoveryCodes` | ✅ |
| `verifyTotp` | ✅ |
| `buildOtpauthUrl` | ✅ |
| `renderQrDataUrl` / `renderQrBuffer` | ✅ |
| `createMemoryRateLimiter` | ⚠️ Minimal |
| `downloadRecoveryCodesAsTxt` | ❌ Missing |
| `formatRecoveryCodesAsText` | ❌ Missing |
| `recoveryCodesToBlob` | ❌ Missing |
| Distributed rate limiter patterns | ❌ Missing |
| Drizzle `/pg`, `/mysql`, `/sqlite` | ✅ |

---

### `@holeauth/plugin-passkey` + `@holeauth/passkey-drizzle`

**Key exports:** `passkey()`, `PasskeyAdapter`, `PasskeyApi`, `createMemoryRateLimiter`, `passkeyRateLimitedError`

| Symbol | Documented? |
|--------|------------|
| `passkey()` factory | ✅ |
| `PasskeyAdapter` interface | ✅ |
| `PasskeyApi` methods | ✅ |
| Client integration (@simplewebauthn) | ✅ |
| Credential options / transports | ❌ Missing |
| Custom attestation validation | ❌ Missing |
| Drizzle `/pg`, `/mysql`, `/sqlite` | ✅ |

---

### `@holeauth/plugin-rbac` + `@holeauth/rbac-drizzle` + `@holeauth/rbac-yaml`

**Key exports:** `rbac()`, `RbacApi`, `GroupDefinition`, `RbacAdapter`, `matchNodes`, `matchNodesAll`, `matchNodesAny`, `matchPattern`, `defaultRbacCache`  
**rbac-yaml:** `loadRbacYaml()`, `resolveInheritance()`, `RbacFileSchema`, `holeauth-rbac-codegen` CLI

| Symbol | Documented? |
|--------|------------|
| `rbac()` factory | ✅ |
| `GroupDefinition` / YAML schema | ✅ |
| `RbacAdapter` interface | ✅ |
| `RbacApi` — `can`, `canAll`, `canAny` | ✅ |
| `RbacApi` — `listGroups`, `getUserGroups`, `assignGroup`, `removeGroup` | ✅ |
| `RbacApi` — `grant`, `revoke`, `reload`, `snapshot` | ✅ |
| `matchNodes` / `matchPattern` utilities | ⚠️ Partial |
| `defaultRbacCache` | ⚠️ Partial |
| Cache adapter implementation | ❌ Missing |
| Custom permission matching | ❌ Missing |
| `holeauth-rbac-codegen` CLI | ❌ Missing |
| Code generation output patterns | ❌ Missing |
| `loadRbacYaml` / `resolveInheritance` | ✅ |
| Drizzle `/pg`, `/mysql`, `/sqlite` | ✅ |

---

### `@holeauth/plugin-idp` + `@holeauth/idp-drizzle`

**Key exports:** `idp()`, `IdpAdapter`, `IdpApi`, `IdpApp`, `IdpTeam`, `IdpTeamMember`, `IdpRefreshToken`, `IdpSigningKey`, `IdpConsent`, `IdpAuthorizationCode`, `BUILTIN_SCOPES`, `rotateSigningKey`, `ensureSigningKey`, `renderConsentPage`, `createMemoryRateLimiter`

| Symbol | Documented? |
|--------|------------|
| `idp()` factory | ✅ |
| `IdpAdapter` interface | ✅ |
| `IdpApi` — `authorize`, `token`, `userinfo`, `discovery` | ✅ |
| `IdpApi` — `revoke`, `endSession` | ✅ |
| `BUILTIN_SCOPES` | ⚠️ Partial |
| `rotateSigningKey` / `ensureSigningKey` | ⚠️ Reference only |
| `renderConsentPage` | ⚠️ Reference only |
| `claimsForUser` customization | ❌ Missing |
| Team management (`IdpTeam`, `IdpTeamMember`, `TeamRole`) | ❌ Missing |
| Multi-tenant patterns | ❌ Missing |
| Advanced scope management | ❌ Missing |
| Signing key rotation guide | ❌ Missing |
| Consent page customization | ❌ Missing |
| Drizzle `/pg`, `/mysql`, `/sqlite` | ✅ |

---

### `@holeauth/react`

**Key exports:** `HoleauthProvider`, `useSession`, `useAuth`, `useCsrf`, `useSignIn`, `useSignUp`, `useSignOut`, `useRefresh`, `usePasswordChange`, `usePasswordReset`, `usePasswordResetRequest`, `useTwoFactorSetup`, `useTwoFactorActivate`, `useTwoFactorVerify`, `useTwoFactorDisable`, `usePasskeyRegister`, `usePasskeyList`, `usePasskeyDelete`, `usePasskeyAuthenticate`, `useSso`, `useCanRbac`, `useRbacSnapshot`, `useAcceptInvite`, `useRejectInvite`, `useAuditLog`, `holeauthFetch`, `useServerSession`

| Symbol | Documented? |
|--------|------------|
| `HoleauthProvider` | ✅ |
| `useSession` / `useAuth` / `useCsrf` | ✅ |
| `useSignIn` / `useSignUp` / `useSignOut` / `useRefresh` | ✅ |
| Password hooks (3) | ✅ |
| 2FA hooks (4) | ✅ |
| Passkey hooks (4) | ✅ |
| `useSso` | ✅ |
| `useCanRbac` / `useRbacSnapshot` | ✅ |
| `useAcceptInvite` / `useRejectInvite` | ⚠️ Minimal |
| `useAuditLog` | ⚠️ Minimal |
| `holeauthFetch` / `useServerSession` | ✅ |
| Error handling patterns | ❌ Missing |
| Type exports documentation | ⚠️ Partial |

---

### `@holeauth/react-ui`

**Key exports:** `SignInForm`, `SignUpForm`, `PasswordResetRequestForm`, `PasswordChangeForm`, `TwoFactorVerifyForm`, `PasskeySetup`, `SignOutButton`, `PasskeyLoginButton`, `SsoButton`, `useSignInForm`, `useSignUpForm`, etc.

| Symbol | Documented? |
|--------|------------|
| All form components | ✅ |
| All atomic components | ✅ |
| Polymorphic props pattern | ✅ |
| Hook access pattern | ✅ |
| Styling / theming guide | ❌ Missing |
| Custom error boundary | ❌ Missing |
| Accessibility / ARIA | ❌ Missing |

---

### `@holeauth/nextjs-app-router`

**Key exports:** `createAuthHandler`, `getSession`, `middleware`, `validateCurrentRequest`, `getFullSession`, `DispatchOptions`, `NextHoleauth`

| Symbol | Documented? |
|--------|------------|
| `createAuthHandler` | ✅ |
| `getSession` (RSC) | ✅ |
| `middleware` | ✅ |
| `validateCurrentRequest` | ✅ |
| `getFullSession` | ✅ |
| `DispatchOptions` reference | ❌ Missing |
| Advanced middleware config | ❌ Missing |

---

### `@holeauth/nextjs-pages-router`

**Key exports:** `createPagesAuthHandler`, `getServerSidePropsSession`, `withAuth`, `createHoleauthPagesContext`, `PagesHoleauth`

| Symbol | Documented? |
|--------|------------|
| `createPagesAuthHandler` | ✅ |
| `getServerSidePropsSession` | ✅ |
| `withAuth` HOF | ✅ |
| `createHoleauthPagesContext` | ✅ |
| GSSP redirect patterns | ❌ Missing |
| tRPC integration example | ❌ Missing (link only) |

---

### `@holeauth/express`

**Key exports:** `createExpressAuth`, `holeauthExpressRouter`, `holeauthSessionMiddleware`, `getSession`, `RequestWithSession`, `ExpressHoleauth`

| Symbol | Documented? |
|--------|------------|
| `createExpressAuth` | ✅ |
| `holeauthExpressRouter` | ✅ |
| `holeauthSessionMiddleware` | ✅ |
| `getSession` | ✅ |
| `RequestWithSession` type | ✅ |
| Error handling middleware | ❌ Missing |
| Custom session serialization | ❌ Missing |

---

### `@holeauth/hono`

**Key exports:** `createHonoAuth`, `createHonoAuthApp`, `holeauthHonoMiddleware`, `getSession`, `HoleauthHonoVariables`, `HonoHoleauth`

| Symbol | Documented? |
|--------|------------|
| `createHonoAuth` | ✅ |
| `createHonoAuthApp` | ✅ |
| `holeauthHonoMiddleware` | ✅ |
| `getSession` | ✅ |
| `HoleauthHonoVariables` type safety | ❌ Missing |
| Integration with Hono middleware stack | ❌ Missing |

---

### `@holeauth/trpc`

**Key exports:** `createHoleauthContext`, `makePermissionProcedure`, `HoleauthTrpcContext`, `RbacLike`

| Symbol | Documented? |
|--------|------------|
| `createHoleauthContext` | ❌ Missing |
| `makePermissionProcedure` | ❌ Missing |
| `HoleauthTrpcContext` type | ❌ Missing |
| `RbacLike` interface | ❌ Missing |
| Session refresh behavior in context | ❌ Missing |
| Type-safe auth context patterns | ❌ Missing |

> **Note:** This package has zero dedicated documentation. Only appears in README code snippets and a reference link in framework pages.

---

## Recommended Priority Order for Docs Work

| Priority | Package / Topic | Effort |
|----------|----------------|--------|
| 🔴 P0 | `@holeauth/trpc` — new dedicated page | Medium |
| 🔴 P0 | `@holeauth/core/flows` — new section in core.mdx | Small |
| 🔴 P0 | `@holeauth/core/cookies` — new section in core.mdx | Small |
| 🟠 P1 | `@holeauth/rbac-yaml` — CLI + codegen docs | Medium |
| 🟠 P1 | `@holeauth/plugin-idp` — teams, scopes, signing key rotation | Large |
| 🟠 P1 | `@holeauth/plugin-2fa` — recovery code utilities | Small |
| 🟡 P2 | `@holeauth/react-ui` — styling/theming/accessibility | Medium |
| 🟡 P2 | `@holeauth/react` — invite + audit log hook detail | Small |
| 🟡 P2 | `@holeauth/core` — error type catalog | Small |
| 🟡 P2 | `@holeauth/nextjs-app-router` — `DispatchOptions` + middleware config | Small |
| 🟢 P3 | `@holeauth/hono` — type variable patterns | Small |
| 🟢 P3 | `@holeauth/express` — error middleware + session serialization | Small |
| 🟢 P3 | `@holeauth/plugin-rbac` — cache adapter + custom matching | Small |
| 🟢 P3 | `@holeauth/plugin-passkey` — credential options + attestation | Small |
