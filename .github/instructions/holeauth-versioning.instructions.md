---
applyTo: "{.changeset/**/*.md,packages/*/package.json}"
description: "Versioning and release conventions for the holeauth monorepo. Apply when writing or reviewing .changeset/*.md files and packages/*/package.json. Enforces correct bump types, fixed-group awareness, and safe release practices."
---

# holeauth — Versioning & Release Conventions

## Changeset files (`.changeset/*.md`)

**File naming**
- Use lowercase kebab-case
- Name the file after the **change**, not the package: `cookie-pending-flow.md`, not `core-patch.md`
- Be specific enough that the name is unique (future changeset files must not clash)

**Frontmatter — packages to list**
- Only list packages that have **observable user-facing changes** in this PR
- Do NOT add a package just to "note" it was touched internally
- If a package re-exports something changed in another package but its own public API is unchanged, omit it

**Bump type selection**

| Type | Use when |
|---|---|
| `patch` | Bug fix, internal refactor, dependency update, docs — no API surface change |
| `minor` | New exported function, hook, component, or option — backward-compatible |
| `major` | Removed/renamed export, changed function signature, changed default behaviour |

**Fixed-group rule (critical)**

The following 13 packages move together as a single version unit:
`@holeauth/core`, `@holeauth/adapter-drizzle`, `@holeauth/nextjs-app-router`, `@holeauth/react`, `@holeauth/plugin-2fa`, `@holeauth/plugin-rbac`, `@holeauth/plugin-passkey`, `@holeauth/plugin-idp`, `@holeauth/2fa-drizzle`, `@holeauth/rbac-drizzle`, `@holeauth/passkey-drizzle`, `@holeauth/idp-drizzle`, `@holeauth/rbac-yaml`

- Listing **any** of them at `minor` bumps all 13 to the same minor version
- Listing **any** of them at `major` bumps all 13 to major
- Prefer `patch` unless the change genuinely warrants `minor`/`major`

**Pre-release mode**
- When `pre.json` is present, versions automatically render as `X.Y.Z-alpha.N` — do NOT write pre-release suffixes in changeset frontmatter
- Correct: `"@holeauth/core": patch`
- Incorrect: `"@holeauth/core": "0.0.3-alpha.0"`

**Body text**
- Write one imperative sentence describing what changed from the user's perspective
- This text appears verbatim in the CHANGELOG — make it meaningful

---

## `packages/*/package.json`

**`"version"` field**
- NEVER edit manually
- Only `changeset version` (run by CI) is allowed to change this field
- If you see a version that looks wrong, follow the Broken-State Recovery procedure in the `holeauth-versioning` skill

**`publishConfig`**
- MUST contain `"access": "public"` for scoped packages
- MUST NOT contain `"provenance": true` — provenance is handled by the `release.yml` GitHub Actions job via OIDC (`id-token: write`). Adding it here breaks all local tooling with `EUSAGE: Automatic provenance generation not supported for provider: null`
- Correct `publishConfig`:
  ```json
  "publishConfig": { "access": "public" }
  ```

**Internal dependency versions**
- Use `workspace:*` for all `@holeauth/*` cross-package dependencies
- Do not pin to specific versions within the monorepo

---

## General release rules

- Releases happen **only via the `release.yml` GitHub Actions workflow**
- The trigger is merging the auto-generated "Version Packages" PR that `changesets/action` opens
- `pnpm changeset publish` and `npm publish` must never be run locally
- `.changeset/pre.json` must never be committed with an unresolved conflict or incomplete state
