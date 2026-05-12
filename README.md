# holeauth

> Modular, edge-native authentication ecosystem for modern TypeScript apps.

[![CI](https://github.com/robert-kratz/holeauth/actions/workflows/ci.yml/badge.svg)](https://github.com/robert-kratz/holeauth/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-cc00ff.svg)](https://pnpm.io)

holeauth is a fully modular authentication framework that ships as a suite of focused packages. Pick only what you need — everything composes cleanly and runs at the edge.

---

## Packages

### Core

| Package | Description |
|---|---|
| `@holeauth/core` | JWT (jose), sessions, password hashing, TOTP/OTP, OIDC primitives, adapter interfaces |
| `@holeauth/adapter-drizzle` | Drizzle ORM adapter — users, sessions, accounts, audit log, verification tokens |
| `@holeauth/nextjs` | Next.js App Router route handler + middleware |
| `@holeauth/react` | Client-side `HoleauthProvider` and auth hooks |
| `@holeauth/react-ui` | Headless UI components for auth flows |
| `@holeauth/trpc` | tRPC context integration with transparent token refresh |

### Framework Adapters

| Package | Description |
|---|---|
| `@holeauth/nextjs-app-router` | App Router-specific utilities |
| `@holeauth/nextjs-pages-router` | Pages Router-specific utilities |
| `@holeauth/express` | Express.js middleware adapter |
| `@holeauth/hono` | Hono adapter for edge runtimes |

### Plugins

| Package | Description |
|---|---|
| `@holeauth/plugin-2fa` | TOTP two-factor authentication plugin |
| `@holeauth/2fa-drizzle` | Drizzle adapter for `plugin-2fa` |
| `@holeauth/plugin-passkey` | WebAuthn / FIDO2 passkey plugin |
| `@holeauth/passkey-drizzle` | Drizzle adapter for `plugin-passkey` |
| `@holeauth/plugin-rbac` | Role-based access control plugin |
| `@holeauth/rbac-drizzle` | Drizzle adapter for `plugin-rbac` |
| `@holeauth/rbac-yaml` | YAML-based role/permission loader |
| `@holeauth/plugin-idp` | OAuth 2.0 / OpenID Connect identity provider plugin |
| `@holeauth/idp-drizzle` | Drizzle adapter for `plugin-idp` |

### Tooling

| Package | Description |
|---|---|
| `@holeauth/eslint-config` | Shared ESLint config |
| `@holeauth/tsconfig` | Shared TypeScript base configs |

---

## Repository Layout

```
holeauth/
├── packages/          # All publishable @holeauth/* packages
├── apps/
│   ├── docs/          # Documentation site (Fumadocs) — private
│   ├── landing/       # Marketing site — private
│   └── playground/    # Full integration sandbox — private
├── .github/
│   ├── workflows/     # CI, Release, Snapshot pipelines
│   └── skills/        # Copilot agent skills
└── docs/              # Static docs / compat matrix
```

---

## Getting Started (Development)

**Requirements:** Node ≥ 20, pnpm ≥ 9

```bash
git clone https://github.com/robert-kratz/holeauth.git
cd holeauth
pnpm install
pnpm build
```

### Useful commands

```bash
pnpm build                        # Build all packages (Turborepo)
pnpm dev                          # Run all dev servers in parallel
pnpm test                         # Run Vitest across all packages
pnpm lint                         # ESLint all packages
pnpm typecheck                    # TypeScript check all packages
pnpm format                       # Prettier — write
pnpm format:check                 # Prettier — check only

# Isolated package/app
pnpm --filter @holeauth/core build
pnpm --filter playground dev      # http://localhost:3000
pnpm --filter docs dev            # http://localhost:3001
```

---

## Contributing

We welcome contributions of all sizes. Here is the full workflow:

### 1. Fork & branch

```bash
# Fork on GitHub, then:
git clone https://github.com/<your-handle>/holeauth.git
cd holeauth
pnpm install
git checkout -b feat/my-feature   # branch off main
```

### 2. Develop & verify

```bash
pnpm lint typecheck test build
```

All four checks must pass before opening a PR.

### 3. Record your change with a changeset

Every PR that touches a publishable package under `packages/` **must** include a changeset:

```bash
pnpm changeset
# Follow the prompts:
#   • Select the packages you changed
#   • Choose patch / minor / major
#   • Write a short human-readable summary
```

This generates a file under `.changeset/` — commit it together with your code.

> **Skip the changeset** only for changes that don't affect published packages (docs, CI config, repo tooling). Check the box in the PR template accordingly.

### 4. Open a Pull Request

- Target branch: `main`
- Fill in the PR template (summary, changeset checkbox, test/docs checklist)
- CI runs automatically: `lint → typecheck → test → build`

### 5. Code review

At least one maintainer review is required before merge.

---

## Release Workflow

Releases are fully automated via [Changesets](https://github.com/changesets/changesets) and GitHub Actions.

```
Merge PR with changeset files
         │
         ▼
  Release workflow runs
         │
         ├─ Unconsumed changesets exist?
         │       YES → opens / updates "chore: version packages" PR
         │              (bumps versions, updates CHANGELOGs)
         │
         └─ Version PR was merged?
                 YES → builds all packages, runs `changeset publish`
                        → publishes to npm with provenance attestation
```

### Alpha / pre-release mode

When `.changeset/pre.json` exists the pipeline publishes with `--tag alpha` and produces versions like `0.0.1-alpha.0`. Maintainers manage entry/exit from pre-release mode via:

```bash
pnpm changeset pre enter alpha   # enter alpha mode
pnpm changeset pre exit          # exit back to stable
```

---

## Snapshot Releases

For testing unreleased changes in a consumer project without merging to `main`:

1. Add the **`snapshot`** label to your open PR  
   *or* trigger the **Snapshot** workflow manually from the Actions tab.
2. The workflow publishes a one-off version to npm under the dist-tag `pr-<number>`:

```bash
# Install the snapshot in your test project
pnpm add @holeauth/core@pr-42
```

Snapshot versions follow the format `0.0.0-alpha-<timestamp>.0` and are never promoted to stable.

---

## CI Pipelines

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push to `main`, every PR | Lint, typecheck, test, build |
| `release.yml` | Push to `main` | Open version PR or publish to npm |
| `snapshot.yml` | PR label `snapshot` / manual dispatch | Publish temporary snapshot to npm |
| `docs.yml` | Push to `main` | Deploy documentation site |

---

## Security

Please report vulnerabilities **privately** via [GitHub Security Advisories](https://github.com/robert-kratz/holeauth/security/advisories) or email **security@holeauth.dev**.

Do **not** open public issues for security reports.

Supported versions: latest minor of each published package.

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).  
Report violations to **conduct@holeauth.dev**.

---

## License

MIT © [Robert Kratz](https://github.com/robert-kratz)
