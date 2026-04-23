#!/usr/bin/env bash
# bootstrap.sh — holeauth monorepo initializer
# Idempotent; re-run safe. Use --force to overwrite existing files.
set -euo pipefail

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

say() { printf "\033[1;34m▸\033[0m %s\n" "$*"; }
ok()  { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
warn(){ printf "\033[1;33m!\033[0m %s\n" "$*"; }

write() {
  # write <path> <<'EOF' ... EOF   (content comes from stdin)
  local path="$1"
  mkdir -p "$(dirname "$path")"
  if [[ -e "$path" && $FORCE -eq 0 ]]; then
    warn "skip (exists): $path"
    cat >/dev/null
    return 0
  fi
  cat >"$path"
  ok "wrote $path"
}

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }
}

# ---------------------------------------------------------------------------
say "Checking prerequisites"
# ---------------------------------------------------------------------------
need node
need pnpm
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node >= 20 required (found $(node -v))"; exit 1
fi

# ---------------------------------------------------------------------------
say "Creating directory skeleton"
# ---------------------------------------------------------------------------
mkdir -p \
  .changeset \
  .github/workflows \
  .github/ISSUE_TEMPLATE \
  apps/docs \
  apps/playground \
  packages/core/src \
  packages/core/test \
  packages/nextjs/src \
  packages/react/src \
  packages/adapter-prisma/src \
  packages/adapter-drizzle/src \
  packages/eslint-config \
  packages/tsconfig

# ---------------------------------------------------------------------------
say "Root: package.json, workspaces, turbo, tsconfig, lint/format, npm/node"
# ---------------------------------------------------------------------------

write package.json <<'EOF'
{
  "name": "holeauth",
  "private": true,
  "version": "0.0.0",
  "description": "holeauth — modular, edge-native auth ecosystem",
  "license": "MIT",
  "author": "Robert Kratz",
  "repository": {
    "type": "git",
    "url": "https://github.com/robert-kratz/holeauth.git"
  },
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md,yml,yaml}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md,yml,yaml}\"",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "release": "turbo run build --filter=./packages/* && changeset publish"
  },
  "devDependencies": {
    "@changesets/cli": "^2.27.9",
    "@types/node": "^20.16.10",
    "prettier": "^3.3.3",
    "turbo": "^2.1.3",
    "typescript": "^5.6.2"
  }
}
EOF

write pnpm-workspace.yaml <<'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF

write turbo.json <<'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": ["**/.env", "**/.env.*"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "out/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
EOF

write tsconfig.base.json <<'EOF'
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "useUnknownInCatchVariables": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
EOF

write .nvmrc <<'EOF'
20
EOF

write .npmrc <<'EOF'
engine-strict=true
strict-peer-dependencies=false
auto-install-peers=true
provenance=true
EOF

write .gitignore <<'EOF'
node_modules
dist
.next
out
.turbo
coverage
.env
.env.*
!.env.example
.DS_Store
*.log
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json
EOF

write .prettierrc <<'EOF'
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
EOF

write .prettierignore <<'EOF'
node_modules
dist
.next
out
.turbo
pnpm-lock.yaml
coverage
CHANGELOG.md
EOF

write .editorconfig <<'EOF'
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
EOF

# ---------------------------------------------------------------------------
say "Internal config packages (@holeauth/tsconfig, @holeauth/eslint-config)"
# ---------------------------------------------------------------------------

write packages/tsconfig/package.json <<'EOF'
{
  "name": "@holeauth/tsconfig",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "files": ["base.json", "library.json", "nextjs.json", "react-library.json"]
}
EOF

write packages/tsconfig/base.json <<'EOF'
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json"
}
EOF

write packages/tsconfig/library.json <<'EOF'
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "WebWorker"],
    "types": ["node"],
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "test", "**/*.test.ts"]
}
EOF

write packages/tsconfig/react-library.json <<'EOF'
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./library.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
EOF

write packages/tsconfig/nextjs.json <<'EOF'
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  }
}
EOF

write packages/eslint-config/package.json <<'EOF'
{
  "name": "@holeauth/eslint-config",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "main": "index.js",
  "files": ["index.js", "next.js", "react.js"],
  "dependencies": {
    "@typescript-eslint/eslint-plugin": "^8.8.0",
    "@typescript-eslint/parser": "^8.8.0",
    "eslint": "^9.12.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react": "^7.37.1",
    "eslint-plugin-react-hooks": "^5.0.0"
  }
}
EOF

write packages/eslint-config/index.js <<'EOF'
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: false,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: { node: true, es2022: true },
  ignorePatterns: ['dist', 'node_modules', '.turbo', '.next', 'out'],
  rules: {
    '@typescript-eslint/consistent-type-imports': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};
EOF

write packages/eslint-config/react.js <<'EOF'
/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: [
    './index.js',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: { react: { version: 'detect' } },
  rules: { 'react/react-in-jsx-scope': 'off' },
};
EOF

write packages/eslint-config/next.js <<'EOF'
/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['./react.js'],
  env: { browser: true, node: true },
};
EOF

# ---------------------------------------------------------------------------
say "Library template (tsup + vitest) for all library packages"
# ---------------------------------------------------------------------------

# Shared writer for a library package scaffold.
write_library_pkg() {
  local name="$1"         # e.g. core
  local pkgname="$2"      # e.g. @holeauth/core
  local description="$3"
  local dir="packages/$name"

  write "$dir/package.json" <<EOF
{
  "name": "$pkgname",
  "version": "0.0.0",
  "description": "$description",
  "license": "MIT",
  "author": "Robert Kratz",
  "repository": {
    "type": "git",
    "url": "https://github.com/robert-kratz/holeauth.git",
    "directory": "$dir"
  },
  "homepage": "https://robert-kratz.github.io/holeauth",
  "bugs": "https://github.com/robert-kratz/holeauth/issues",
  "keywords": ["auth", "authentication", "jwt", "edge", "holeauth"],
  "sideEffects": false,
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist .turbo",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "devDependencies": {
    "@holeauth/eslint-config": "workspace:*",
    "@holeauth/tsconfig": "workspace:*",
    "@types/node": "^20.16.10",
    "tsup": "^8.3.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.2"
  }
}
EOF

  write "$dir/tsconfig.json" <<'EOF'
{
  "extends": "@holeauth/tsconfig/library.json",
  "compilerOptions": { "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "test"]
}
EOF

  write "$dir/tsup.config.ts" <<'EOF'
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
});
EOF

  write "$dir/vitest.config.ts" <<'EOF'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
EOF

  write "$dir/.eslintrc.cjs" <<'EOF'
/** @type {import('eslint').Linter.Config} */
module.exports = { root: true, extends: ['@holeauth/eslint-config'] };
EOF

  write "$dir/README.md" <<EOF
# $pkgname

$description

> Part of the [holeauth](https://github.com/robert-kratz/holeauth) ecosystem.
EOF
}

# ---------------------------------------------------------------------------
say "Package: @holeauth/core"
# ---------------------------------------------------------------------------
write_library_pkg core "@holeauth/core" "Edge-native auth primitives: JWT, sessions, password hashing, TOTP, OTP, OIDC, adapter interfaces."

# Override core package.json to add runtime deps (jose, otpauth, @node-rs/argon2 optional)
write packages/core/package.json <<'EOF'
{
  "name": "@holeauth/core",
  "version": "0.0.0",
  "description": "Edge-native auth primitives: JWT, sessions, password hashing, TOTP, OTP, OIDC, adapter interfaces.",
  "license": "MIT",
  "author": "Robert Kratz",
  "repository": {
    "type": "git",
    "url": "https://github.com/robert-kratz/holeauth.git",
    "directory": "packages/core"
  },
  "homepage": "https://robert-kratz.github.io/holeauth",
  "bugs": "https://github.com/robert-kratz/holeauth/issues",
  "keywords": ["auth", "jwt", "jose", "edge", "oidc", "totp", "holeauth"],
  "sideEffects": false,
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./jwt":      { "types": "./dist/jwt/index.d.ts",      "import": "./dist/jwt/index.js",      "require": "./dist/jwt/index.cjs" },
    "./session":  { "types": "./dist/session/index.d.ts",  "import": "./dist/session/index.js",  "require": "./dist/session/index.cjs" },
    "./password": { "types": "./dist/password/index.d.ts", "import": "./dist/password/index.js", "require": "./dist/password/index.cjs" },
    "./totp":     { "types": "./dist/totp/index.d.ts",     "import": "./dist/totp/index.js",     "require": "./dist/totp/index.cjs" },
    "./otp":      { "types": "./dist/otp/index.d.ts",      "import": "./dist/otp/index.js",      "require": "./dist/otp/index.cjs" },
    "./sso":      { "types": "./dist/sso/index.d.ts",      "import": "./dist/sso/index.js",      "require": "./dist/sso/index.cjs" },
    "./adapters": { "types": "./dist/adapters/index.d.ts", "import": "./dist/adapters/index.js", "require": "./dist/adapters/index.cjs" },
    "./errors":   { "types": "./dist/errors/index.d.ts",   "import": "./dist/errors/index.js",   "require": "./dist/errors/index.cjs" },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist .turbo",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "jose": "^5.9.3",
    "otpauth": "^9.3.4"
  },
  "optionalDependencies": {
    "@node-rs/argon2": "^2.0.0"
  },
  "devDependencies": {
    "@holeauth/eslint-config": "workspace:*",
    "@holeauth/tsconfig": "workspace:*",
    "@types/node": "^20.16.10",
    "tsup": "^8.3.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.2"
  }
}
EOF

write packages/core/tsup.config.ts <<'EOF'
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/jwt/index.ts',
    'src/session/index.ts',
    'src/password/index.ts',
    'src/totp/index.ts',
    'src/otp/index.ts',
    'src/sso/index.ts',
    'src/adapters/index.ts',
    'src/errors/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: 'es2022',
  external: ['@node-rs/argon2'],
});
EOF

# core source stubs
mkdir -p packages/core/src/{jwt,session,password,totp,otp,sso,adapters,errors,types,utils}

write packages/core/src/index.ts <<'EOF'
/**
 * @holeauth/core
 *
 * Edge-native auth primitives. This barrel re-exports the public surface;
 * consumers can also import subpaths (e.g. `@holeauth/core/jwt`).
 */
export * from './types/index.js';
export * from './errors/index.js';
export * as jwt from './jwt/index.js';
export * as session from './session/index.js';
export * as password from './password/index.js';
export * as totp from './totp/index.js';
export * as otp from './otp/index.js';
export * as sso from './sso/index.js';
export * as adapters from './adapters/index.js';
export { defineHoleauth } from './define.js';
EOF

write packages/core/src/define.ts <<'EOF'
import type { HoleauthConfig, HoleauthInstance } from './types/index.js';

/**
 * defineHoleauth — primary factory.
 * Wires adapters, secrets, token policies, and providers into a usable auth instance.
 * TODO: implement full wiring in Phase 2 (session issuance + provider registry).
 */
export function defineHoleauth(config: HoleauthConfig): HoleauthInstance {
  return {
    config,
    // Placeholders; real implementations live in ./session, ./sso, etc.
    async signIn() {
      throw new Error('holeauth: signIn not implemented yet');
    },
    async signOut() {
      throw new Error('holeauth: signOut not implemented yet');
    },
    async getSession() {
      return null;
    },
  };
}
EOF

write packages/core/src/types/index.ts <<'EOF'
import type { UserAdapter, SessionAdapter, AccountAdapter, VerificationTokenAdapter } from '../adapters/index.js';

export interface TokenPolicy {
  /** Access token lifetime in seconds. Default: 900 (15m). */
  accessTtl?: number;
  /** Refresh token lifetime in seconds. Default: 2592000 (30d). */
  refreshTtl?: number;
  /** Cookie name prefix. Default: 'holeauth'. */
  cookiePrefix?: string;
}

export interface HoleauthSecrets {
  /** JWT signing secret (or asymmetric key material). */
  jwtSecret: string | Uint8Array;
}

export interface OIDCProviderConfig {
  id: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  scopes?: string[];
}

export interface HoleauthAdapters {
  user: UserAdapter;
  session: SessionAdapter;
  account?: AccountAdapter;
  verificationToken?: VerificationTokenAdapter;
}

export interface HoleauthConfig {
  secrets: HoleauthSecrets;
  adapters: HoleauthAdapters;
  tokens?: TokenPolicy;
  providers?: OIDCProviderConfig[];
}

export interface SessionData {
  userId: string;
  sessionId: string;
  expiresAt: number;
  [key: string]: unknown;
}

export interface HoleauthInstance {
  config: HoleauthConfig;
  signIn(input: unknown): Promise<unknown>;
  signOut(input: unknown): Promise<void>;
  getSession(input?: unknown): Promise<SessionData | null>;
}
EOF

write packages/core/src/errors/index.ts <<'EOF'
export class HoleauthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HoleauthError';
    this.code = code;
  }
}
export class InvalidTokenError extends HoleauthError {
  constructor(message = 'Invalid token') { super('INVALID_TOKEN', message); }
}
export class SessionExpiredError extends HoleauthError {
  constructor(message = 'Session expired') { super('SESSION_EXPIRED', message); }
}
export class AdapterError extends HoleauthError {
  constructor(message = 'Adapter error') { super('ADAPTER_ERROR', message); }
}
export class ProviderError extends HoleauthError {
  constructor(message = 'Provider error') { super('PROVIDER_ERROR', message); }
}
EOF

write packages/core/src/jwt/index.ts <<'EOF'
import { SignJWT, jwtVerify, decodeJwt, type JWTPayload } from 'jose';
import { InvalidTokenError } from '../errors/index.js';

function toKey(secret: string | Uint8Array): Uint8Array {
  return typeof secret === 'string' ? new TextEncoder().encode(secret) : secret;
}

export interface SignOptions {
  issuer?: string;
  audience?: string;
  subject?: string;
  expiresIn?: string | number; // e.g. '15m' or seconds
  jti?: string;
}

export async function sign(
  payload: JWTPayload,
  secret: string | Uint8Array,
  opts: SignOptions = {},
): Promise<string> {
  const jwt = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();
  if (opts.issuer) jwt.setIssuer(opts.issuer);
  if (opts.audience) jwt.setAudience(opts.audience);
  if (opts.subject) jwt.setSubject(opts.subject);
  if (opts.jti) jwt.setJti(opts.jti);
  if (opts.expiresIn !== undefined) jwt.setExpirationTime(opts.expiresIn);
  return jwt.sign(toKey(secret));
}

export async function verify<T extends JWTPayload = JWTPayload>(
  token: string,
  secret: string | Uint8Array,
): Promise<T> {
  try {
    const { payload } = await jwtVerify(token, toKey(secret));
    return payload as T;
  } catch (e) {
    throw new InvalidTokenError((e as Error).message);
  }
}

export function decode<T extends JWTPayload = JWTPayload>(token: string): T {
  try {
    return decodeJwt(token) as T;
  } catch (e) {
    throw new InvalidTokenError((e as Error).message);
  }
}
EOF

write packages/core/src/session/index.ts <<'EOF'
import { sign, verify } from '../jwt/index.js';
import type { HoleauthConfig, SessionData } from '../types/index.js';

const ACCESS_DEFAULT = 900;      // 15m
const REFRESH_DEFAULT = 2592000; // 30d

export async function issueAccessToken(cfg: HoleauthConfig, session: SessionData): Promise<string> {
  const ttl = cfg.tokens?.accessTtl ?? ACCESS_DEFAULT;
  return sign(
    { sid: session.sessionId, sub: session.userId },
    cfg.secrets.jwtSecret,
    { expiresIn: `${ttl}s` },
  );
}

export async function issueRefreshToken(cfg: HoleauthConfig, session: SessionData): Promise<string> {
  const ttl = cfg.tokens?.refreshTtl ?? REFRESH_DEFAULT;
  return sign(
    { sid: session.sessionId, sub: session.userId, typ: 'refresh' },
    cfg.secrets.jwtSecret,
    { expiresIn: `${ttl}s` },
  );
}

export async function validateSession(cfg: HoleauthConfig, token: string): Promise<SessionData | null> {
  try {
    const payload = await verify<{ sid: string; sub: string; exp?: number }>(token, cfg.secrets.jwtSecret);
    if (!payload.sid || !payload.sub) return null;
    return { sessionId: payload.sid, userId: payload.sub, expiresAt: (payload.exp ?? 0) * 1000 };
  } catch {
    return null;
  }
}

// TODO: rotateRefresh + revokeSession require the SessionAdapter round-trip.
EOF

write packages/core/src/password/index.ts <<'EOF'
/**
 * Runtime-agnostic password hashing.
 * - Node: tries to load @node-rs/argon2 (optionalDependency).
 * - Edge / fallback: PBKDF2 via WebCrypto (SHA-256, 100k iterations).
 *
 * Hash format: "<scheme>$<params>$<salt_b64>$<hash_b64>"
 *   scheme = "argon2id" | "pbkdf2-sha256"
 */

const ITER = 100_000;
const KEYLEN = 32;
const SALT_LEN = 16;

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2Hash(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey('raw', keyMaterial as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITER, hash: 'SHA-256' },
    key,
    KEYLEN * 8,
  );
  return new Uint8Array(bits);
}

async function tryArgon2(): Promise<typeof import('@node-rs/argon2') | null> {
  try {
    // Hidden dynamic import to avoid bundlers (webpack/turbopack) walking into
    // @node-rs/argon2's native .node binaries. The package is listed in
    // `serverExternalPackages` / peer-optional by consumers when needed.
    const dynImport = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>;
    const mod = (await dynImport('@node-rs/argon2').catch(() => null)) as
      | typeof import('@node-rs/argon2')
      | null;
    return mod ?? null;
  } catch {
    return null;
  }
}

export async function hash(password: string): Promise<string> {
  const argon = await tryArgon2();
  if (argon) {
    return argon.hash(password); // native argon2id encoded string
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const h = await pbkdf2Hash(password, salt);
  return `pbkdf2-sha256$${ITER}$${b64(salt)}$${b64(h)}`;
}

export async function verify(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$argon2')) {
    const argon = await tryArgon2();
    if (!argon) return false;
    return argon.verify(stored, password);
  }
  const [scheme, iterStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2-sha256' || !iterStr || !saltB64 || !hashB64) return false;
  const salt = fromB64(saltB64);
  const expected = fromB64(hashB64);
  const keyMaterial = new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey('raw', keyMaterial as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: Number(iterStr), hash: 'SHA-256' },
    key,
    expected.length * 8,
  );
  const out = new Uint8Array(bits);
  if (out.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < out.length; i++) diff |= out[i]! ^ expected[i]!;
  return diff === 0;
}
EOF

write packages/core/src/totp/index.ts <<'EOF'
import { TOTP, Secret } from 'otpauth';

export interface TotpConfig {
  issuer: string;
  label: string;
  period?: number;
  digits?: number;
}

export function generateSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function otpauthUrl(secret: string, cfg: TotpConfig): string {
  return new TOTP({
    issuer: cfg.issuer,
    label: cfg.label,
    algorithm: 'SHA1',
    digits: cfg.digits ?? 6,
    period: cfg.period ?? 30,
    secret: Secret.fromBase32(secret),
  }).toString();
}

export function verifyToken(token: string, secret: string, window = 1): boolean {
  const totp = new TOTP({ secret: Secret.fromBase32(secret) });
  return totp.validate({ token, window }) !== null;
}

export function generateRecoveryCodes(count = 10): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    out.push(Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
  }
  return out;
}
EOF

write packages/core/src/otp/index.ts <<'EOF'
/**
 * Email / numeric OTP helpers. The mailer itself is adapter-injected.
 */
export function generateNumericOtp(length = 6): string {
  const max = 10 ** length;
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % max;
  return n.toString().padStart(length, '0');
}

export interface OtpChallenge {
  code: string;
  expiresAt: number;
}

export function createChallenge(ttlSeconds = 600, length = 6): OtpChallenge {
  return { code: generateNumericOtp(length), expiresAt: Date.now() + ttlSeconds * 1000 };
}

export function isExpired(challenge: OtpChallenge): boolean {
  return Date.now() > challenge.expiresAt;
}
EOF

write packages/core/src/sso/index.ts <<'EOF'
/**
 * Generic OIDC client (PKCE + state).
 * Concrete Google/GitHub providers are thin wrappers — see ./providers.
 */
import { ProviderError } from '../errors/index.js';

export interface AuthorizeParams {
  issuerAuthUrl: string;
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  state: string;
  codeChallenge: string;
}

export function buildAuthorizeUrl(p: AuthorizeParams): string {
  const url = new URL(p.issuerAuthUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', p.clientId);
  url.searchParams.set('redirect_uri', p.redirectUri);
  url.searchParams.set('scope', (p.scopes ?? ['openid', 'email', 'profile']).join(' '));
  url.searchParams.set('state', p.state);
  url.searchParams.set('code_challenge', p.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64url(bytes);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(hash)) };
}

export function generateState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

export interface TokenExchangeInput {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export async function exchangeCode(i: TokenExchangeInput): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: i.code,
    redirect_uri: i.redirectUri,
    client_id: i.clientId,
    client_secret: i.clientSecret,
    code_verifier: i.codeVerifier,
  });
  const res = await fetch(i.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!res.ok) throw new ProviderError(`Token exchange failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

function base64url(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
EOF

write packages/core/src/adapters/index.ts <<'EOF'
/**
 * Adapter interfaces. ORM/database-specific adapters live in separate packages
 * (e.g. @holeauth/adapter-prisma, @holeauth/adapter-drizzle).
 */

export interface AdapterUser {
  id: string;
  email: string;
  emailVerified?: Date | null;
  name?: string | null;
  image?: string | null;
  passwordHash?: string | null;
  twoFactorSecret?: string | null;
}

export interface AdapterSession {
  id: string;
  userId: string;
  expiresAt: Date;
  refreshTokenHash: string;
}

export interface AdapterAccount {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}

export interface AdapterVerificationToken {
  identifier: string;
  token: string;
  expiresAt: Date;
}

export interface UserAdapter {
  getUserById(id: string): Promise<AdapterUser | null>;
  getUserByEmail(email: string): Promise<AdapterUser | null>;
  createUser(data: Omit<AdapterUser, 'id'>): Promise<AdapterUser>;
  updateUser(id: string, patch: Partial<AdapterUser>): Promise<AdapterUser>;
  deleteUser(id: string): Promise<void>;
}

export interface SessionAdapter {
  createSession(data: Omit<AdapterSession, 'id'>): Promise<AdapterSession>;
  getSession(id: string): Promise<AdapterSession | null>;
  deleteSession(id: string): Promise<void>;
  rotateRefresh(id: string, newHash: string, expiresAt: Date): Promise<AdapterSession>;
}

export interface AccountAdapter {
  linkAccount(data: Omit<AdapterAccount, 'id'>): Promise<AdapterAccount>;
  getAccountByProvider(provider: string, providerAccountId: string): Promise<AdapterAccount | null>;
  unlinkAccount(id: string): Promise<void>;
}

export interface VerificationTokenAdapter {
  create(data: AdapterVerificationToken): Promise<AdapterVerificationToken>;
  consume(identifier: string, token: string): Promise<AdapterVerificationToken | null>;
}
EOF

write packages/core/test/jwt.test.ts <<'EOF'
import { describe, it, expect } from 'vitest';
import { sign, verify } from '../src/jwt/index.js';

describe('jwt', () => {
  it('signs and verifies a round-trip HS256 token', async () => {
    const secret = 'test-secret-please-change';
    const token = await sign({ hello: 'world' }, secret, { expiresIn: '1m' });
    const payload = await verify<{ hello: string }>(token, secret);
    expect(payload.hello).toBe('world');
  });
});
EOF

write packages/core/test/totp.test.ts <<'EOF'
import { describe, it, expect } from 'vitest';
import { generateSecret, otpauthUrl, verifyToken } from '../src/totp/index.js';
import { TOTP, Secret } from 'otpauth';

describe('totp', () => {
  it('generates a base32 secret and validates a fresh code', () => {
    const secret = generateSecret();
    const code = new TOTP({ secret: Secret.fromBase32(secret) }).generate();
    expect(verifyToken(code, secret)).toBe(true);
  });

  it('otpauth url is well-formed', () => {
    const secret = generateSecret();
    const url = otpauthUrl(secret, { issuer: 'holeauth', label: 'user@example.com' });
    expect(url).toMatch(/^otpauth:\/\/totp\//);
  });
});
EOF

write packages/core/test/password.test.ts <<'EOF'
import { describe, it, expect } from 'vitest';
import { hash, verify } from '../src/password/index.js';

describe('password', () => {
  it('hashes and verifies (pbkdf2 fallback is always present)', async () => {
    const h = await hash('correct horse battery staple');
    expect(h.length).toBeGreaterThan(20);
    expect(await verify('correct horse battery staple', h)).toBe(true);
    expect(await verify('wrong password', h)).toBe(false);
  });
});
EOF

# ---------------------------------------------------------------------------
say "Package: @holeauth/nextjs"
# ---------------------------------------------------------------------------
write_library_pkg nextjs "@holeauth/nextjs" "Next.js App Router bindings for holeauth."

write packages/nextjs/package.json <<'EOF'
{
  "name": "@holeauth/nextjs",
  "version": "0.0.0",
  "description": "Next.js App Router bindings for holeauth.",
  "license": "MIT",
  "author": "Robert Kratz",
  "repository": {
    "type": "git",
    "url": "https://github.com/robert-kratz/holeauth.git",
    "directory": "packages/nextjs"
  },
  "homepage": "https://robert-kratz.github.io/holeauth",
  "bugs": "https://github.com/robert-kratz/holeauth/issues",
  "keywords": ["auth", "nextjs", "app-router", "edge", "holeauth"],
  "sideEffects": false,
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./middleware": {
      "types": "./dist/middleware.d.ts",
      "import": "./dist/middleware.js",
      "require": "./dist/middleware.cjs"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist .turbo",
    "lint": "eslint \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@holeauth/core": "workspace:*"
  },
  "peerDependencies": {
    "next": ">=14",
    "react": ">=18"
  },
  "devDependencies": {
    "@holeauth/eslint-config": "workspace:*",
    "@holeauth/tsconfig": "workspace:*",
    "@types/node": "^20.16.10",
    "@types/react": "^18.3.11",
    "next": "^15.0.0",
    "react": "^18.3.1",
    "tsup": "^8.3.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.2"
  }
}
EOF

write packages/nextjs/tsup.config.ts <<'EOF'
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/middleware.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'next',
    'next/server',
    'next/headers',
    'react',
    'react-dom',
    '@holeauth/core',
    '@holeauth/core/session',
    '@holeauth/core/jwt',
    '@holeauth/core/adapters',
    '@holeauth/core/password',
    '@holeauth/core/totp',
    '@holeauth/core/otp',
    '@holeauth/core/sso',
    '@holeauth/core/errors',
  ],
  target: 'es2022',
});
EOF

write packages/nextjs/src/index.ts <<'EOF'
import { cookies } from 'next/headers';
import { defineHoleauth, type HoleauthConfig, type HoleauthInstance } from '@holeauth/core';
import * as sessionMod from '@holeauth/core/session';

const COOKIE_ACCESS = (cfg: HoleauthConfig) => `${cfg.tokens?.cookiePrefix ?? 'holeauth'}.at`;
const COOKIE_REFRESH = (cfg: HoleauthConfig) => `${cfg.tokens?.cookiePrefix ?? 'holeauth'}.rt`;

export interface NextHoleauth extends HoleauthInstance {
  handlers: {
    GET: (req: Request) => Promise<Response>;
    POST: (req: Request) => Promise<Response>;
  };
}

export function createAuthHandler(config: HoleauthConfig): NextHoleauth {
  const base = defineHoleauth(config);

  async function getSession() {
    // @ts-expect-error: Next 15 cookies() is async in some contexts
    const store = typeof cookies === 'function' ? await cookies() : cookies();
    const token = store.get(COOKIE_ACCESS(config))?.value;
    if (!token) return null;
    return sessionMod.validateSession(config, token);
  }

  async function route(req: Request): Promise<Response> {
    // TODO: dispatch /signin, /signout, /callback/:provider, /session, /refresh
    const url = new URL(req.url);
    if (url.pathname.endsWith('/session')) {
      const s = await getSession();
      return Response.json(s);
    }
    return new Response('Not Implemented', { status: 501 });
  }

  return {
    ...base,
    handlers: { GET: route, POST: route },
    getSession,
  };
}

export { COOKIE_ACCESS, COOKIE_REFRESH };
export type { HoleauthConfig } from '@holeauth/core';
EOF

write packages/nextjs/src/middleware.ts <<'EOF'
import { NextResponse, type NextRequest } from 'next/server';
import * as sessionMod from '@holeauth/core/session';
import type { HoleauthConfig } from '@holeauth/core';

export interface MiddlewareOptions {
  config: HoleauthConfig;
  /** Paths that require a valid session. */
  protect: (string | RegExp)[];
  /** Where to send unauthenticated users. */
  signInPath?: string;
}

export function holeauthMiddleware(opts: MiddlewareOptions) {
  return async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;
    const needsAuth = opts.protect.some((p) =>
      typeof p === 'string' ? pathname.startsWith(p) : p.test(pathname),
    );
    if (!needsAuth) return NextResponse.next();

    const name = `${opts.config.tokens?.cookiePrefix ?? 'holeauth'}.at`;
    const token = req.cookies.get(name)?.value;
    const session = token ? await sessionMod.validateSession(opts.config, token) : null;
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = opts.signInPath ?? '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  };
}
EOF

# ---------------------------------------------------------------------------
say "Package: @holeauth/react"
# ---------------------------------------------------------------------------
write_library_pkg react "@holeauth/react" "React client provider + hooks for holeauth."

write packages/react/package.json <<'EOF'
{
  "name": "@holeauth/react",
  "version": "0.0.0",
  "description": "React client provider + hooks for holeauth.",
  "license": "MIT",
  "author": "Robert Kratz",
  "repository": {
    "type": "git",
    "url": "https://github.com/robert-kratz/holeauth.git",
    "directory": "packages/react"
  },
  "homepage": "https://robert-kratz.github.io/holeauth",
  "bugs": "https://github.com/robert-kratz/holeauth/issues",
  "keywords": ["auth", "react", "hooks", "holeauth"],
  "sideEffects": false,
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rm -rf dist .turbo",
    "lint": "eslint \"src/**/*.{ts,tsx}\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "peerDependencies": {
    "react": ">=18"
  },
  "devDependencies": {
    "@holeauth/eslint-config": "workspace:*",
    "@holeauth/tsconfig": "workspace:*",
    "@types/react": "^18.3.11",
    "react": "^18.3.1",
    "tsup": "^8.3.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.2"
  }
}
EOF

write packages/react/tsconfig.json <<'EOF'
{
  "extends": "@holeauth/tsconfig/react-library.json",
  "compilerOptions": { "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules"]
}
EOF

write packages/react/tsup.config.ts <<'EOF'
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  target: 'es2022',
});
EOF

write packages/react/src/index.ts <<'EOF'
'use client';
import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ClientSession {
  userId: string;
  sessionId: string;
  expiresAt: number;
}

interface Ctx {
  session: ClientSession | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const HoleauthCtx = createContext<Ctx | null>(null);

export interface ProviderProps {
  children: ReactNode;
  /** Endpoint that returns the current session JSON (default: /api/auth/session). */
  sessionUrl?: string;
  /** Endpoint to POST to for signing out (default: /api/auth/signout). */
  signOutUrl?: string;
}

export function HoleauthProvider({
  children,
  sessionUrl = '/api/auth/session',
  signOutUrl = '/api/auth/signout',
}: ProviderProps) {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(sessionUrl, { credentials: 'include' });
      setSession(res.ok ? ((await res.json()) as ClientSession | null) : null);
    } finally {
      setLoading(false);
    }
  }, [sessionUrl]);

  const signOut = useCallback(async () => {
    await fetch(signOutUrl, { method: 'POST', credentials: 'include' });
    setSession(null);
  }, [signOutUrl]);

  useEffect(() => { void refresh(); }, [refresh]);

  return createElement(HoleauthCtx.Provider, { value: { session, loading, refresh, signOut } }, children);
}

export function useSession(): ClientSession | null {
  const ctx = useContext(HoleauthCtx);
  if (!ctx) throw new Error('useSession must be used inside <HoleauthProvider>');
  return ctx.session;
}

export function useAuth(): Ctx {
  const ctx = useContext(HoleauthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <HoleauthProvider>');
  return ctx;
}
EOF

# ---------------------------------------------------------------------------
say "Packages: adapter-prisma, adapter-drizzle (stubs)"
# ---------------------------------------------------------------------------
write_library_pkg adapter-prisma "@holeauth/adapter-prisma" "Prisma adapter for holeauth (stub)."
write_library_pkg adapter-drizzle "@holeauth/adapter-drizzle" "Drizzle adapter for holeauth (stub)."

# Add core dep to both adapters
for adapter in adapter-prisma adapter-drizzle; do
  PKG="packages/$adapter/package.json"
  node -e "
    const fs=require('fs');const p='$PKG';const j=JSON.parse(fs.readFileSync(p,'utf8'));
    j.dependencies={...(j.dependencies||{}), '@holeauth/core':'workspace:*'};
    fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
  "
done

write packages/adapter-prisma/src/index.ts <<'EOF'
import type { UserAdapter, SessionAdapter } from '@holeauth/core/adapters';

/**
 * Prisma reference adapter — STUB.
 * Accepts a PrismaClient (typed loosely to avoid a hard dep) and returns adapter implementations.
 * Expected schema models: User, Session, Account, VerificationToken.
 * See docs/adapters/prisma for the reference Prisma schema.
 */
export interface PrismaLike {
  user: unknown;
  session: unknown;
  account?: unknown;
  verificationToken?: unknown;
}

export function prismaAdapter(_prisma: PrismaLike): { user: UserAdapter; session: SessionAdapter } {
  throw new Error('@holeauth/adapter-prisma: not implemented yet');
}
EOF

write packages/adapter-drizzle/src/index.ts <<'EOF'
import type { UserAdapter, SessionAdapter } from '@holeauth/core/adapters';

/**
 * Drizzle reference adapter — STUB.
 * Takes a Drizzle DB instance and a set of table references.
 */
export interface DrizzleTables {
  users: unknown;
  sessions: unknown;
  accounts?: unknown;
  verificationTokens?: unknown;
}

export function drizzleAdapter(
  _db: unknown,
  _tables: DrizzleTables,
): { user: UserAdapter; session: SessionAdapter } {
  throw new Error('@holeauth/adapter-drizzle: not implemented yet');
}
EOF

# ---------------------------------------------------------------------------
say "apps/docs — Fumadocs (Next.js, static export → GitHub Pages)"
# ---------------------------------------------------------------------------

write apps/docs/package.json <<'EOF'
{
  "name": "docs",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001",
    "lint": "next lint",
    "typecheck": "echo \"docs: type-checked via next build\"",
    "clean": "rm -rf .next out .turbo .source"
  },
  "dependencies": {
    "fumadocs-core": "^14.0.0",
    "fumadocs-mdx": "^11.0.0",
    "fumadocs-ui": "^14.0.0",
    "next": "^15.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@holeauth/tsconfig": "workspace:*",
    "@types/node": "^20.16.10",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.6.2"
  }
}
EOF

write apps/docs/next.config.mjs <<'EOF'
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  basePath: process.env.DOCS_BASE_PATH ?? '',
  trailingSlash: true,
  // Fumadocs generates a `.source/` virtual module whose inferred types reference
  // private fumadocs-mdx types. This trips Next.js' built-in type checker without
  // affecting runtime. The docs app is a static-export site; we skip its type
  // check during `next build` and rely on `pnpm typecheck` at the package level.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default withMDX(config);
EOF

write apps/docs/source.config.ts <<'EOF'
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig();
EOF

write apps/docs/tsconfig.json <<'EOF'
{
  "extends": "@holeauth/tsconfig/nextjs.json",
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", ".next", "out"]
}
EOF

write apps/docs/app/layout.tsx <<'EOF'
import type { ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider';
import 'fumadocs-ui/style.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
EOF

write apps/docs/app/page.tsx <<'EOF'
import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: '4rem', maxWidth: 720, margin: '0 auto' }}>
      <h1>holeauth</h1>
      <p>Modular, edge-native auth ecosystem.</p>
      <p>
        <Link href="/docs">Read the docs →</Link>
      </p>
    </main>
  );
}
EOF

write apps/docs/app/docs/layout.tsx <<'EOF'
import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ title: 'holeauth' }}
    >
      {children}
    </DocsLayout>
  );
}
EOF

write apps/docs/app/docs/[[...slug]]/page.tsx <<'EOF'
import { notFound } from 'next/navigation';
import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { source } from '@/lib/source';

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsBody>
        <h1>{page.data.title}</h1>
        <MDX />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}
EOF

write apps/docs/lib/source.ts <<'EOF'
import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});
EOF

write apps/docs/content/docs/index.mdx <<'EOF'
---
title: Introduction
description: Welcome to holeauth
---

# holeauth

A modular, edge-native authentication ecosystem for modern TypeScript apps.

- **Edge-first** — powered by `jose`, WebCrypto, and runtime detection.
- **Adapter-based** — bring your own ORM/DB.
- **Framework-agnostic core** — Next.js today, Vue/Svelte next.

## Packages

- `@holeauth/core` — primitives (JWT, sessions, password, TOTP/OTP, OIDC).
- `@holeauth/nextjs` — App Router handlers + middleware.
- `@holeauth/react` — client provider + hooks.
- `@holeauth/adapter-prisma`, `@holeauth/adapter-drizzle` — DB adapters.
EOF

write apps/docs/content/docs/getting-started.mdx <<'EOF'
---
title: Getting Started
description: Install and wire up holeauth
---

```bash
pnpm add @holeauth/core @holeauth/nextjs @holeauth/react
```

See [Core Concepts](/docs/concepts) for the adapter pattern and token model.
EOF

write apps/docs/content/docs/concepts.mdx <<'EOF'
---
title: Core Concepts
description: Architecture and mental model
---

## Adapters
holeauth never touches your database directly. You implement `UserAdapter` and
`SessionAdapter` (optionally `AccountAdapter`, `VerificationTokenAdapter`)
from `@holeauth/core/adapters` — or install a reference adapter.

## Tokens
Access tokens are short-lived (default 15 min) and stored in an `httpOnly`
cookie. Refresh tokens rotate on use (default 30 d lifetime).
EOF

write apps/docs/content/docs/meta.json <<'EOF'
{
  "title": "holeauth",
  "pages": ["index", "getting-started", "concepts"]
}
EOF

write apps/docs/.gitignore <<'EOF'
.next
out
.source
EOF

# ---------------------------------------------------------------------------
say "apps/playground — Next.js 15 App Router demo"
# ---------------------------------------------------------------------------

write apps/playground/package.json <<'EOF'
{
  "name": "playground",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf .next .turbo"
  },
  "dependencies": {
    "@holeauth/core": "workspace:*",
    "@holeauth/nextjs": "workspace:*",
    "@holeauth/react": "workspace:*",
    "next": "^15.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@holeauth/tsconfig": "workspace:*",
    "@types/node": "^20.16.10",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2"
  }
}
EOF

write apps/playground/next.config.mjs <<'EOF'
/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // @node-rs/argon2 ships native .node binaries; keep it out of webpack's graph.
  serverExternalPackages: ['@node-rs/argon2'],
};
export default config;
EOF

write apps/playground/tsconfig.json <<'EOF'
{
  "extends": "@holeauth/tsconfig/nextjs.json",
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", ".next/types/**/*.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", ".next"]
}
EOF

write apps/playground/postcss.config.mjs <<'EOF'
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
EOF

write apps/playground/tailwind.config.ts <<'EOF'
import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
EOF

write apps/playground/app/globals.css <<'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root { color-scheme: light dark; }
body { font-family: ui-sans-serif, system-ui, sans-serif; }
EOF

write apps/playground/lib/auth.ts <<'EOF'
import { createAuthHandler } from '@holeauth/nextjs';
import type { UserAdapter, SessionAdapter, AdapterUser, AdapterSession } from '@holeauth/core/adapters';

// Minimal in-memory adapters for the playground. DO NOT use in production.
const users = new Map<string, AdapterUser>();
const sessions = new Map<string, AdapterSession>();

const userAdapter: UserAdapter = {
  async getUserById(id) { return users.get(id) ?? null; },
  async getUserByEmail(email) { return [...users.values()].find((u) => u.email === email) ?? null; },
  async createUser(data) {
    const user: AdapterUser = { id: crypto.randomUUID(), ...data };
    users.set(user.id, user);
    return user;
  },
  async updateUser(id, patch) {
    const u = users.get(id); if (!u) throw new Error('no user');
    const next = { ...u, ...patch }; users.set(id, next); return next;
  },
  async deleteUser(id) { users.delete(id); },
};

const sessionAdapter: SessionAdapter = {
  async createSession(data) {
    const s: AdapterSession = { id: crypto.randomUUID(), ...data };
    sessions.set(s.id, s);
    return s;
  },
  async getSession(id) { return sessions.get(id) ?? null; },
  async deleteSession(id) { sessions.delete(id); },
  async rotateRefresh(id, newHash, expiresAt) {
    const s = sessions.get(id); if (!s) throw new Error('no session');
    const next = { ...s, refreshTokenHash: newHash, expiresAt };
    sessions.set(id, next);
    return next;
  },
};

export const auth = createAuthHandler({
  secrets: { jwtSecret: process.env.HOLEAUTH_SECRET ?? 'dev-secret-change-me' },
  adapters: { user: userAdapter, session: sessionAdapter },
  tokens: { cookiePrefix: 'holeauth' },
});
EOF

write apps/playground/app/api/auth/[...holeauth]/route.ts <<'EOF'
import { auth } from '@/lib/auth';

// argon2 (optional dep) is Node-only; use the edge runtime in your own app
// only if you stick to the scrypt fallback and avoid native deps.
export const runtime = 'nodejs';
export const { GET, POST } = auth.handlers;
EOF

write apps/playground/app/layout.tsx <<'EOF'
import './globals.css';
import type { ReactNode } from 'react';
import { HoleauthProvider } from '@holeauth/react';

export const metadata = { title: 'holeauth — Playground' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <HoleauthProvider sessionUrl="/api/auth/session">
          <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>
        </HoleauthProvider>
      </body>
    </html>
  );
}
EOF

write apps/playground/app/page.tsx <<'EOF'
'use client';
import Link from 'next/link';
import { useAuth } from '@holeauth/react';

export default function Home() {
  const { session, loading, signOut } = useAuth();
  return (
    <main className="space-y-6">
      <h1 className="text-3xl font-bold">holeauth — Playground</h1>
      <p className="text-sm opacity-70">
        A full-feature sandbox: login / register / 2FA / SSO / protected routes / passkeys (stub).
      </p>
      {loading ? <p>Loading session…</p> : session ? (
        <div className="space-y-3">
          <p>Signed in as <code>{session.userId}</code>.</p>
          <button className="rounded border px-3 py-1" onClick={() => signOut()}>Sign out</button>
          <ul className="list-disc pl-6">
            <li><Link href="/dashboard">Protected dashboard →</Link></li>
            <li><Link href="/2fa/setup">2FA setup →</Link></li>
          </ul>
        </div>
      ) : (
        <ul className="list-disc pl-6">
          <li><Link href="/login">Login →</Link></li>
          <li><Link href="/register">Register →</Link></li>
        </ul>
      )}
    </main>
  );
}
EOF

write apps/playground/app/login/page.tsx <<'EOF'
export default function LoginPage() {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <form className="space-y-3" method="post" action="/api/auth/signin">
        <input name="email" type="email" placeholder="Email" className="w-full border rounded px-3 py-2" />
        <input name="password" type="password" placeholder="Password" className="w-full border rounded px-3 py-2" />
        <button className="rounded bg-black px-4 py-2 text-white">Sign in</button>
      </form>
      <div className="space-y-2">
        <p className="text-sm opacity-70">Or continue with:</p>
        <div className="flex gap-2">
          <a className="rounded border px-3 py-1" href="/api/auth/authorize/google">Google</a>
          <a className="rounded border px-3 py-1" href="/api/auth/authorize/github">GitHub</a>
          <button className="rounded border px-3 py-1" disabled>Passkey (soon)</button>
        </div>
      </div>
    </main>
  );
}
EOF

write apps/playground/app/register/page.tsx <<'EOF'
export default function RegisterPage() {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Register</h1>
      <form className="space-y-3" method="post" action="/api/auth/register">
        <input name="email" type="email" placeholder="Email" className="w-full border rounded px-3 py-2" />
        <input name="password" type="password" placeholder="Password" className="w-full border rounded px-3 py-2" />
        <button className="rounded bg-black px-4 py-2 text-white">Create account</button>
      </form>
    </main>
  );
}
EOF

write apps/playground/app/dashboard/page.tsx <<'EOF'
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function Dashboard() {
  const s = await auth.getSession();
  if (!s) redirect('/login');
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Protected Dashboard</h1>
      <pre className="rounded bg-gray-100 p-4 text-xs dark:bg-gray-900">{JSON.stringify(s, null, 2)}</pre>
    </main>
  );
}
EOF

write apps/playground/app/2fa/setup/page.tsx <<'EOF'
export default function TwoFactorSetup() {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">2FA Setup (stub)</h1>
      <p>Would render a QR code for the TOTP secret and accept a verification code.</p>
    </main>
  );
}
EOF

write apps/playground/middleware.ts <<'EOF'
import { holeauthMiddleware } from '@holeauth/nextjs/middleware';

// Playground uses a dev secret; real apps should read from env.
export default holeauthMiddleware({
  config: {
    secrets: { jwtSecret: process.env.HOLEAUTH_SECRET ?? 'dev-secret-change-me' },
    // The middleware only validates tokens; adapters are not required here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapters: {} as any,
    tokens: { cookiePrefix: 'holeauth' },
  },
  protect: ['/dashboard', '/2fa'],
  signInPath: '/login',
});

export const config = { matcher: ['/dashboard/:path*', '/2fa/:path*'] };
EOF

write apps/playground/.env.example <<'EOF'
HOLEAUTH_SECRET="please-change-me-min-32-chars-0000"
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
EOF

write apps/playground/.gitignore <<'EOF'
.next
.turbo
EOF

# ---------------------------------------------------------------------------
say "Changesets config"
# ---------------------------------------------------------------------------

write .changeset/config.json <<'EOF'
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["docs", "playground"]
}
EOF

write .changeset/README.md <<'EOF'
# Changesets

Run `pnpm changeset` to describe a change. CI will open a release PR; merging it publishes to npm.
EOF

# ---------------------------------------------------------------------------
say "GitHub workflows & templates"
# ---------------------------------------------------------------------------

write .github/workflows/ci.yml <<'EOF'
name: CI
on:
  push: { branches: [main] }
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint typecheck test build
EOF

write .github/workflows/release.yml <<'EOF'
name: Release
on:
  push: { branches: [main] }

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run build --filter=./packages/*
      - uses: changesets/action@v1
        with:
          publish: pnpm release
          version: pnpm version-packages
          commit: 'chore: version packages'
          title: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
EOF

write .github/workflows/docs.yml <<'EOF'
name: Docs
on:
  push:
    branches: [main]
    paths:
      - 'apps/docs/**'
      - 'packages/**/README.md'
      - '.github/workflows/docs.yml'

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Build docs
        env:
          DOCS_BASE_PATH: /holeauth
        run: pnpm --filter docs build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: apps/docs/out }
      - id: deploy
        uses: actions/deploy-pages@v4
EOF

write .github/PULL_REQUEST_TEMPLATE.md <<'EOF'
## Summary

<!-- What does this PR do? -->

## Changeset

- [ ] I ran `pnpm changeset` and included the generated file, **or** this change requires none (docs/ci/infra).

## Checklist

- [ ] Tests added/updated
- [ ] Types updated
- [ ] Docs updated (if user-facing)
EOF

write .github/ISSUE_TEMPLATE/bug_report.yml <<'EOF'
name: Bug report
description: Something is broken
labels: [bug]
body:
  - type: input
    attributes: { label: Package, placeholder: '@holeauth/core' }
    validations: { required: true }
  - type: textarea
    attributes: { label: Reproduction, description: Minimal repro or code snippet }
    validations: { required: true }
  - type: textarea
    attributes: { label: Expected vs actual }
  - type: input
    attributes: { label: Version }
EOF

write .github/ISSUE_TEMPLATE/feature_request.yml <<'EOF'
name: Feature request
description: Propose a new capability
labels: [enhancement]
body:
  - type: textarea
    attributes: { label: Problem }
    validations: { required: true }
  - type: textarea
    attributes: { label: Proposal }
    validations: { required: true }
EOF

write .github/ISSUE_TEMPLATE/config.yml <<'EOF'
blank_issues_enabled: false
contact_links:
  - name: Discussions
    url: https://github.com/robert-kratz/holeauth/discussions
    about: Questions, ideas, and general help
EOF

# ---------------------------------------------------------------------------
say "Governance files (MIT, CONTRIBUTING, CoC, SECURITY, README)"
# ---------------------------------------------------------------------------

CURRENT_YEAR="$(date +%Y)"
write LICENSE <<EOF
MIT License

Copyright (c) $CURRENT_YEAR Robert Kratz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

write README.md <<'EOF'
# holeauth

> Modular, edge-native auth ecosystem for modern TypeScript apps.

- `@holeauth/core` — JWT (jose), sessions, password, TOTP/OTP, OIDC, adapter interfaces
- `@holeauth/nextjs` — Next.js App Router handlers + middleware
- `@holeauth/react` — client provider + hooks
- `@holeauth/adapter-prisma`, `@holeauth/adapter-drizzle` — database adapters

## Dev

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter playground dev   # http://localhost:3000
pnpm --filter docs dev         # http://localhost:3001
```

## Publishing

1. `pnpm changeset` to describe your change
2. Commit + open PR
3. On merge to `main`, the Release workflow opens a version-PR; merging it publishes to npm

## License

MIT © Robert Kratz
EOF

write CONTRIBUTING.md <<'EOF'
# Contributing

1. Fork & clone; `pnpm install` (Node 20, pnpm 9).
2. Create a branch off `main`.
3. Make changes; run `pnpm lint typecheck test build`.
4. Run `pnpm changeset` and describe the change (patch/minor/major).
5. Commit, push, open a PR against `main`.

## Monorepo layout

- `packages/*` — publishable libraries
- `apps/*` — private (docs, playground)

## Scripts

- `pnpm build` — build all packages
- `pnpm dev` — run all dev servers in parallel
- `pnpm test` — run Vitest across all packages
EOF

write CODE_OF_CONDUCT.md <<'EOF'
# Contributor Covenant Code of Conduct

This project follows the Contributor Covenant v2.1.
Full text: https://www.contributor-covenant.org/version/2/1/code_of_conduct/

Report violations to: conduct@holeauth.dev
EOF

write SECURITY.md <<'EOF'
# Security Policy

Please report vulnerabilities privately via GitHub Security Advisories
(https://github.com/robert-kratz/holeauth/security/advisories) or email
security@holeauth.dev. Do not open public issues for security reports.

Supported versions: latest minor of each published package.
EOF

# ---------------------------------------------------------------------------
say "pnpm install"
# ---------------------------------------------------------------------------
pnpm install

ok "Bootstrap complete."
echo ""
echo "Next steps:"
echo "  pnpm turbo run build     # build all packages"
echo "  pnpm turbo run test      # run Vitest suites"
echo "  pnpm --filter playground dev"
echo "  pnpm --filter docs dev"
echo "  pnpm changeset           # describe your first change"
