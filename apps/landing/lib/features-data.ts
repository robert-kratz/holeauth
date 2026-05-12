export type FeatureCategory = 'core' | 'plugin' | 'adapter';
export type IconName = 'Shield' | 'Fingerprint' | 'Users' | 'LogIn' | 'Building2' | 'Code2' | 'Database';
export type CodeLang = 'bash' | 'typescript' | 'yaml';

export interface CodeStep {
  step: number;
  title: string;
  description: string;
  filename?: string;
  language: CodeLang;
  code: string;
}

export interface ConceptItem {
  /** Short label — rendered as bold prefix or mono badge. */
  label: string;
  /** Optional supporting description. */
  description?: string;
  /** Render `label` as monospace (env var, code identifier, etc.). */
  mono?: boolean;
}

export interface ConceptSection {
  heading: string;
  intro?: string;
  items: ConceptItem[];
}

export interface FeatureData {
  slug: string;
  iconName: IconName;
  category: FeatureCategory;
  badge: string;
  title: string;
  tagline: string;
  description: string;
  packages: string[];
  installCmd: string;
  highlights: string[];
  steps: CodeStep[];
  /** Optional deeper-dive sections: concepts, env vars, configuration knobs. */
  concepts?: ConceptSection[];
  docsHref: string;
}

export const FEATURES_DATA: FeatureData[] = [
  // ── 2FA ────────────────────────────────────────────────────────────────────
  {
    slug: '2fa',
    iconName: 'Shield',
    category: 'plugin',
    badge: 'TOTP · RFC 6238',
    title: 'Two-Factor Auth',
    tagline: 'TOTP enrollment, verification, recovery codes — all in one plugin.',
    description:
      'Drop in RFC 6238-compliant TOTP without rolling your own: QR generation, rate-limited verification, backup recovery codes, and a Drizzle adapter that handles the schema for you.',
    packages: ['@holeauth/plugin-2fa', '@holeauth/2fa-drizzle'],
    installCmd: 'pnpm add @holeauth/plugin-2fa @holeauth/2fa-drizzle',
    highlights: [
      'RFC 6238 compliant TOTP',
      'Built-in rate limiting',
      'QR code generation',
      'Backup recovery codes',
      'Drizzle adapter included',
      'Works on the edge',
    ],
    steps: [
      {
        step: 1,
        title: 'Install packages',
        description: 'Add the plugin and the Drizzle adapter to your project.',
        language: 'bash',
        code: 'pnpm add @holeauth/plugin-2fa @holeauth/2fa-drizzle',
      },
      {
        step: 2,
        title: 'Extend your Drizzle schema',
        description:
          'Import the ready-made table helpers and spread them into your schema export.',
        filename: 'db/schema.ts',
        language: 'typescript',
        code: `import { pgTable } from 'drizzle-orm/pg-core';
import { createTotpTable } from '@holeauth/2fa-drizzle/pg';

export const totpSecrets = createTotpTable(pgTable);`,
      },
      {
        step: 3,
        title: 'Register the plugin',
        description: 'Pass the Drizzle 2FA adapter to your auth instance.',
        filename: 'lib/auth.ts',
        language: 'typescript',
        code: `import { createAuth } from '@holeauth/core';
import { drizzle2faAdapter } from '@holeauth/2fa-drizzle';
import { plugin2fa } from '@holeauth/plugin-2fa';
import { db } from './db';
import { totpSecrets } from '../db/schema';

export const auth = createAuth({
  // ... core config
  plugins: [
    plugin2fa({
      adapter: drizzle2faAdapter(db, { totpSecrets }),
      issuer: 'My App',
    }),
  ],
});`,
      },
      {
        step: 4,
        title: 'Enroll and verify',
        description: 'Use the plugin API to enroll a user and verify TOTP codes.',
        filename: 'app/api/2fa/route.ts',
        language: 'typescript',
        code: `import { auth } from '@/lib/auth';

// Enroll — returns otpauth:// URI + base32 secret
export async function POST(req: Request) {
  const session = await auth.getSession(req);
  const { uri, secret } = await auth.plugins['2fa'].enroll(session.userId);
  return Response.json({ uri, secret });
}

// Verify a 6-digit TOTP code
export async function PUT(req: Request) {
  const { code } = await req.json();
  const session  = await auth.getSession(req);
  const ok = await auth.plugins['2fa'].verify(session.userId, code);
  return Response.json({ ok });
}`,
      },
    ],
    concepts: [
      {
        heading: 'How TOTP enrollment works',
        intro:
          'A user scans the QR — generated from the `otpauth://` URI — into any authenticator app (1Password, Authy, Google Authenticator). The secret is stored encrypted by your adapter; verification only succeeds after the user confirms a first code, preventing half-enrolled accounts.',
        items: [
          { label: 'enroll(userId)', mono: true, description: 'Issues a fresh base32 secret + provisioning URI. Idempotent until verified.' },
          { label: 'verify(userId, code)', mono: true, description: 'Validates against the current 30-second window with ±1 step drift tolerance.' },
          { label: 'unenroll(userId)', mono: true, description: 'Wipes the secret and revokes all backup codes.' },
        ],
      },
      {
        heading: 'Configuration knobs',
        items: [
          { label: 'issuer', mono: true, description: 'Display name shown in authenticator apps. Must match your brand.' },
          { label: 'window: 1', mono: true, description: 'Accepted ± steps of clock drift. Higher = laxer, lower = stricter.' },
          { label: 'rateLimit: { max: 5, windowMs: 60_000 }', mono: true, description: 'Built-in throttle on verify attempts. Defends against TOTP brute-force.' },
          { label: 'recoveryCodes: { count: 10 }', mono: true, description: 'How many one-time backup codes to issue at enrollment.' },
        ],
      },
      {
        heading: 'Required env vars',
        items: [
          { label: 'SESSION_SECRET', mono: true, description: 'Already required by core — used to derive the encryption key for stored TOTP secrets.' },
        ],
      },
    ],
    docsHref: '/docs/packages/plugin-2fa',
  },

  // ── Passkeys ───────────────────────────────────────────────────────────────
  {
    slug: 'passkeys',
    iconName: 'Fingerprint',
    category: 'plugin',
    badge: 'WebAuthn · FIDO2',
    title: 'Passkeys',
    tagline: 'Biometric, passwordless login — one plugin, any device.',
    description:
      'Full WebAuthn RP implementation: passkey registration, authentication ceremonies, credential management, and a Drizzle adapter. Works on iOS, Android, macOS, and Windows Hello.',
    packages: ['@holeauth/plugin-passkey', '@holeauth/passkey-drizzle'],
    installCmd: 'pnpm add @holeauth/plugin-passkey @holeauth/passkey-drizzle',
    highlights: [
      'WebAuthn Level 3',
      'iOS, Android, Windows, macOS',
      'Credential management',
      'CBOR parsing built-in',
      'Drizzle adapter included',
      'No external service needed',
    ],
    steps: [
      {
        step: 1,
        title: 'Install packages',
        description: 'Add the passkey plugin and its Drizzle adapter.',
        language: 'bash',
        code: 'pnpm add @holeauth/plugin-passkey @holeauth/passkey-drizzle',
      },
      {
        step: 2,
        title: 'Extend your Drizzle schema',
        description: 'Add the passkey credential table.',
        filename: 'db/schema.ts',
        language: 'typescript',
        code: `import { pgTable } from 'drizzle-orm/pg-core';
import { createPasskeyTable } from '@holeauth/passkey-drizzle/pg';

export const passkeyCredentials = createPasskeyTable(pgTable);`,
      },
      {
        step: 3,
        title: 'Register the plugin',
        description: 'Configure your relying party origin and add the adapter.',
        filename: 'lib/auth.ts',
        language: 'typescript',
        code: `import { createAuth } from '@holeauth/core';
import { drizzlePasskeyAdapter } from '@holeauth/passkey-drizzle';
import { pluginPasskey } from '@holeauth/plugin-passkey';
import { db } from './db';
import { passkeyCredentials } from '../db/schema';

export const auth = createAuth({
  // ... core config
  plugins: [
    pluginPasskey({
      adapter: drizzlePasskeyAdapter(db, { passkeyCredentials }),
      rpId:    'example.com',
      rpName:  'My App',
      origin:  'https://example.com',
    }),
  ],
});`,
      },
      {
        step: 4,
        title: 'Register & authenticate',
        description: 'Kick off registration and authentication ceremonies.',
        filename: 'app/api/passkey/route.ts',
        language: 'typescript',
        code: `import { auth } from '@/lib/auth';

// Start registration — returns PublicKeyCredentialCreationOptions
export async function POST(req: Request) {
  const session = await auth.getSession(req);
  const options = await auth.plugins.passkey.startRegistration(session.userId);
  return Response.json(options);
}

// Finish registration — stores the credential
export async function PUT(req: Request) {
  const body    = await req.json();
  const session = await auth.getSession(req);
  await auth.plugins.passkey.finishRegistration(session.userId, body);
  return Response.json({ ok: true });
}`,
      },
    ],
    concepts: [
      {
        heading: 'The two ceremonies',
        intro:
          'WebAuthn defines two flows: **registration** binds a new credential to a user, **authentication** proves possession of an existing one. Both are two-step server interactions — the server issues a challenge, the browser signs it, the server verifies the signature.',
        items: [
          { label: 'startRegistration(userId)', mono: true, description: 'Returns PublicKeyCredentialCreationOptions for `navigator.credentials.create()`.' },
          { label: 'finishRegistration(userId, response)', mono: true, description: 'Verifies the attestation, parses the COSE key, persists the credential.' },
          { label: 'startAuthentication(userId?)', mono: true, description: 'Issues an authentication challenge. Omit `userId` for discoverable (passkey) flows.' },
          { label: 'finishAuthentication(response)', mono: true, description: 'Verifies the assertion signature and bumps the credential counter.' },
        ],
      },
      {
        heading: 'Packages in this plugin',
        items: [
          { label: '@holeauth/plugin-passkey', mono: true, description: 'Server-side WebAuthn Relying Party: challenge issuance, CBOR/COSE parsing, signature verification.' },
          { label: '@holeauth/passkey-drizzle', mono: true, description: 'Drizzle schema + adapter for credential storage. Drop-in for Postgres, MySQL, SQLite.' },
          { label: '@holeauth/react', mono: true, description: 'Client helpers wrapping `navigator.credentials` — handles base64url + array conversion.' },
        ],
      },
      {
        heading: 'Configuration knobs',
        items: [
          { label: 'rpId', mono: true, description: 'Relying Party ID — must match your apex domain. Cannot include scheme or port.' },
          { label: 'rpName', mono: true, description: 'Human-readable name shown by the OS during the ceremony.' },
          { label: 'origin', mono: true, description: 'Expected `window.origin` of the registering page. Use an array for multi-origin apps.' },
          { label: 'userVerification: \'preferred\'', mono: true, description: "Set to 'required' to force biometric / PIN; 'discouraged' for silent re-auth." },
          { label: 'attestation: \'none\'', mono: true, description: "Switch to 'direct' if you need device-level attestation statements." },
        ],
      },
    ],
    docsHref: '/docs/packages/plugin-passkey',
  },

  // ── RBAC ───────────────────────────────────────────────────────────────────
  {
    slug: 'rbac',
    iconName: 'Users',
    category: 'plugin',
    badge: 'Roles · Permissions',
    title: 'RBAC',
    tagline: 'Roles, groups, wildcard permissions — declared in YAML, enforced at runtime.',
    description:
      'A complete Role-Based Access Control engine: define roles in a YAML file, assign them via the Drizzle adapter, and check permissions anywhere with a single function call. TTL-cached lookups keep it fast at scale.',
    packages: ['@holeauth/plugin-rbac', '@holeauth/rbac-drizzle', '@holeauth/rbac-yaml'],
    installCmd: 'pnpm add @holeauth/plugin-rbac @holeauth/rbac-drizzle @holeauth/rbac-yaml',
    highlights: [
      'YAML-defined roles',
      'Wildcard permissions (posts:*)',
      'Direct user overrides',
      'Group membership',
      'TTL-cached lookups',
      'tRPC & Next.js middleware',
    ],
    steps: [
      {
        step: 1,
        title: 'Install packages',
        description: 'Install the RBAC plugin, Drizzle adapter, and YAML loader.',
        language: 'bash',
        code: 'pnpm add @holeauth/plugin-rbac @holeauth/rbac-drizzle @holeauth/rbac-yaml',
      },
      {
        step: 2,
        title: 'Define roles in YAML',
        description: 'Create a roles file at the root of your project.',
        filename: 'holeauth.rbac.yml',
        language: 'yaml',
        code: `roles:
  admin:
    permissions:
      - '*'
  editor:
    permissions:
      - posts:read
      - posts:write
      - posts:delete
  viewer:
    permissions:
      - posts:read`,
      },
      {
        step: 3,
        title: 'Register the plugin',
        description: 'Wire up the RBAC plugin with YAML config and Drizzle adapter.',
        filename: 'lib/auth.ts',
        language: 'typescript',
        code: `import { createAuth } from '@holeauth/core';
import { pluginRbac } from '@holeauth/plugin-rbac';
import { drizzleRbacAdapter } from '@holeauth/rbac-drizzle';
import { loadRbacYaml } from '@holeauth/rbac-yaml';
import { db } from './db';

export const auth = createAuth({
  // ... core config
  plugins: [
    pluginRbac({
      adapter:  drizzleRbacAdapter(db),
      config:   await loadRbacYaml('./holeauth.rbac.yml'),
      cacheTtl: 30_000,
    }),
  ],
});`,
      },
      {
        step: 4,
        title: 'Enforce permissions',
        description:
          'Check permissions in middleware, tRPC procedures, or server actions.',
        filename: 'middleware.ts',
        language: 'typescript',
        code: `import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const session = await auth.getSession(req);

  const can = await auth.plugins.rbac.check(session?.userId, 'posts:write');
  if (!can) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.next();
}`,
      },
    ],
    concepts: [
      {
        heading: 'The permission model',
        intro:
          'Every permission is a colon-delimited string: `resource:action` or deeper (`billing:invoices:refund`). Roles aggregate permissions; users get roles via the adapter; direct user overrides bypass roles entirely. Checks always fall back to a deny.',
        items: [
          { label: 'posts:read', mono: true, description: 'Literal match — granted only if the role explicitly lists `posts:read`.' },
          { label: 'posts:*', mono: true, description: 'Wildcard segment — matches `posts:read`, `posts:write`, `posts:anything`.' },
          { label: '*', mono: true, description: 'Global super-permission — typical of the `admin` role. Use sparingly.' },
          { label: 'billing:invoices:refund', mono: true, description: 'Deep hierarchies are supported. Wildcards match the trailing segment only.' },
        ],
      },
      {
        heading: 'YAML config surface',
        intro:
          'The YAML loader merges `roles`, `groups`, and `directGrants` into a single in-memory graph. ENV interpolation is supported with `${ENV_VAR}` so you can keep secrets out of the file.',
        items: [
          { label: 'roles.<name>.permissions', mono: true, description: 'Array of permission strings. Wildcards allowed.' },
          { label: 'roles.<name>.inherits', mono: true, description: 'Roll up permissions from one or more parent roles — diamond inheritance is fine.' },
          { label: 'groups.<name>.roles', mono: true, description: 'Assign multiple roles to a group; users inherit all of them.' },
          { label: 'directGrants.<userId>', mono: true, description: 'User-specific permission grants that override role membership.' },
        ],
      },
      {
        heading: 'Env-driven roles',
        intro:
          'For self-hosted scenarios you often want the admin user list driven by env, not by a UI. `loadRbacYaml` interpolates `${VAR}` placeholders at load time.',
        items: [
          { label: 'HOLEAUTH_RBAC_ADMINS', mono: true, description: 'Comma-separated user IDs. Reference with `${HOLEAUTH_RBAC_ADMINS}` in YAML.' },
          { label: 'cacheTtl: 30_000', mono: true, description: 'Plugin option — ms to cache user-to-role lookups. Set to `0` to disable.' },
        ],
      },
    ],
    docsHref: '/docs/packages/plugin-rbac',
  },

  // ── SSO / IDP ──────────────────────────────────────────────────────────────
  {
    slug: 'sso-idp',
    iconName: 'Building2',
    category: 'plugin',
    badge: 'OAuth 2.0 · OIDC Server',
    title: 'SSO Provider',
    tagline: 'Become an OAuth 2.0 and OIDC authorization server — spec-compliant, in minutes.',
    description:
      'Turn any holeauth app into a full OpenID Connect provider: authorization code + PKCE, dynamic client registration, JWKS rotation, consent screens, token introspection, and RFC 7009 revocation.',
    packages: ['@holeauth/plugin-idp', '@holeauth/idp-drizzle'],
    installCmd: 'pnpm add @holeauth/plugin-idp @holeauth/idp-drizzle',
    highlights: [
      'Authorization Code + PKCE',
      'Dynamic client registration',
      'JWKS key rotation',
      'Token introspection (RFC 7662)',
      'Token revocation (RFC 7009)',
      '/.well-known/openid-configuration',
    ],
    steps: [
      {
        step: 1,
        title: 'Install packages',
        description: 'Add the IDP plugin and its Drizzle adapter.',
        language: 'bash',
        code: 'pnpm add @holeauth/plugin-idp @holeauth/idp-drizzle',
      },
      {
        step: 2,
        title: 'Extend your Drizzle schema',
        description: 'Add the OAuth client, token, and grant tables.',
        filename: 'db/schema.ts',
        language: 'typescript',
        code: `import { pgTable } from 'drizzle-orm/pg-core';
import { createIdpTables } from '@holeauth/idp-drizzle/pg';

export const {
  oauthClients,
  oauthTokens,
  oauthGrants,
} = createIdpTables(pgTable);`,
      },
      {
        step: 3,
        title: 'Register the plugin',
        description: 'Configure your issuer URL, signing keys, and token lifetimes.',
        filename: 'lib/auth.ts',
        language: 'typescript',
        code: `import { createAuth } from '@holeauth/core';
import { pluginIdp } from '@holeauth/plugin-idp';
import { drizzleIdpAdapter } from '@holeauth/idp-drizzle';
import { db } from './db';
import { oauthClients, oauthTokens, oauthGrants } from '../db/schema';

export const auth = createAuth({
  // ... core config
  plugins: [
    pluginIdp({
      adapter:         drizzleIdpAdapter(db, { oauthClients, oauthTokens, oauthGrants }),
      issuer:          'https://auth.example.com',
      accessTokenTtl:  900,    // 15 min
      refreshTokenTtl: 86_400, // 24 h
    }),
  ],
});`,
      },
      {
        step: 4,
        title: 'Expose OIDC endpoints',
        description:
          'The route handler automatically mounts all required OIDC endpoints.',
        filename: 'app/api/auth/[...holeauth]/route.ts',
        language: 'typescript',
        code: `import { toNextJsHandler } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

// Mounts automatically:
//   GET  /.well-known/openid-configuration
//   GET  /api/auth/jwks
//   POST /api/auth/token
//   GET  /api/auth/authorize
//   POST /api/auth/revoke
export const { GET, POST } = toNextJsHandler(auth);`,
      },
    ],
    concepts: [
      {
        heading: 'You become the IDP',
        intro:
          'This plugin turns your holeauth app into a full OAuth 2.0 / OpenID Connect **authorization server**. Other apps redirect their users to *you* to sign in, then exchange a code for tokens. The flip side — signing your users in *via* Google or another IDP — is the OAuth2 Client plugin.',
        items: [
          { label: '/.well-known/openid-configuration', mono: true, description: 'Discovery document advertising every endpoint and supported flow.' },
          { label: '/api/auth/authorize', mono: true, description: 'User-facing authorization endpoint. Renders consent, then redirects with a code.' },
          { label: '/api/auth/token', mono: true, description: 'Exchanges authorization codes and refresh tokens for access tokens.' },
          { label: '/api/auth/jwks', mono: true, description: 'Public key set for verifying signed access + id tokens. Auto-rotates.' },
          { label: '/api/auth/revoke', mono: true, description: 'RFC 7009 revocation. Wipes a refresh family if a token is reported leaked.' },
          { label: '/api/auth/introspect', mono: true, description: 'RFC 7662 token introspection — protected resources can validate tokens here.' },
        ],
      },
      {
        heading: 'Refresh token rotation',
        intro:
          'Refresh tokens are issued with a `familyId`. Using a refresh token rotates it; replay of an old token revokes the entire family. This catches stolen tokens automatically — the legitimate client gets logged out the moment the attacker uses the old refresh.',
        items: [
          { label: 'accessTokenTtl', mono: true, description: 'Lifetime of access tokens in seconds. 900 (15 min) is the recommended default.' },
          { label: 'refreshTokenTtl', mono: true, description: 'Lifetime of refresh tokens. 86 400 (24 h) keeps the blast radius small.' },
          { label: 'familyMaxAgeSec', mono: true, description: 'Hard cap on a refresh family. Forces re-authentication after N seconds.' },
        ],
      },
      {
        heading: 'Required env vars',
        items: [
          { label: 'HOLEAUTH_IDP_ISSUER', mono: true, description: 'Public HTTPS URL — must match `issuer` in plugin config. Embedded in `iss` claims.' },
          { label: 'HOLEAUTH_IDP_JWKS_KEYS', mono: true, description: 'JSON array of signing keys. Generate with `holeauth keygen`. Rotate by appending.' },
        ],
      },
    ],
    docsHref: '/docs/packages/plugin-idp',
  },

  // ── OAuth2 Client ──────────────────────────────────────────────────────────
  {
    slug: 'oauth2-client',
    iconName: 'LogIn',
    category: 'plugin',
    badge: 'OIDC Relying Party',
    title: 'OAuth2 Client',
    tagline: 'Sign users in with Google, GitHub, any OIDC server — one consumer plugin.',
    description:
      'The IDP consumer plugin makes your app an OAuth 2.0 / OIDC Relying Party. Configure as many providers as you need — Google, GitHub, Discord, Microsoft, or a generic OIDC server — and let holeauth handle the callback, token exchange, and user linking.',
    packages: ['@holeauth/plugin-idp'],
    installCmd: 'pnpm add @holeauth/plugin-idp',
    highlights: [
      'Google, GitHub, Discord, Microsoft',
      'Generic OIDC provider support',
      'Automatic user account linking',
      'PKCE by default',
      'Access & refresh token storage',
      'Works with any holeauth IDP',
    ],
    steps: [
      {
        step: 1,
        title: 'Install the package',
        description:
          'The IDP plugin covers both server (provider) and client (consumer) roles.',
        language: 'bash',
        code: 'pnpm add @holeauth/plugin-idp',
      },
      {
        step: 2,
        title: 'Configure providers',
        description: 'Add any number of OAuth providers — built-in presets or custom OIDC.',
        filename: 'lib/auth.ts',
        language: 'typescript',
        code: `import { createAuth } from '@holeauth/core';
import { pluginIdpConsumer, providers } from '@holeauth/plugin-idp/consumer';

export const auth = createAuth({
  // ... core config
  plugins: [
    pluginIdpConsumer({
      providers: [
        providers.google({
          clientId:     process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
        providers.github({
          clientId:     process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        }),
        // Generic OIDC (e.g. another holeauth IDP)
        providers.oidc({
          id:           'my-idp',
          issuer:       'https://auth.example.com',
          clientId:     process.env.MY_IDP_CLIENT_ID!,
          clientSecret: process.env.MY_IDP_CLIENT_SECRET!,
        }),
      ],
    }),
  ],
});`,
      },
      {
        step: 3,
        title: 'Mount the route handler',
        description: 'holeauth handles the OAuth callback automatically.',
        filename: 'app/api/auth/[...holeauth]/route.ts',
        language: 'typescript',
        code: `import { toNextJsHandler } from '@holeauth/nextjs';
import { auth } from '@/lib/auth';

// Handles GET /api/auth/callback/[provider]
export const { GET, POST } = toNextJsHandler(auth);`,
      },
      {
        step: 4,
        title: 'Trigger sign-in',
        description: "Redirect the user to the provider's authorization endpoint.",
        filename: 'app/login/page.tsx',
        language: 'typescript',
        code: `import { auth } from '@/lib/auth';

export default async function LoginPage() {
  const googleUrl = await auth.plugins.idpConsumer.getAuthorizationUrl('google', {
    redirectTo: '/dashboard',
  });

  return (
    <a href={googleUrl} className="btn">
      Sign in with Google
    </a>
  );
}`,
      },
    ],
    concepts: [
      {
        heading: 'You are the Relying Party',
        intro:
          'This plugin is the **opposite** of the SSO Provider. Instead of issuing tokens to other apps, you delegate sign-in to an external IDP — Google, GitHub, Microsoft, or another holeauth instance — and link the returned profile to a local user.',
        items: [
          { label: 'getAuthorizationUrl(providerId, opts)', mono: true, description: 'Builds the redirect URL — adds PKCE, state, nonce, and your callback.' },
          { label: '/api/auth/callback/[provider]', mono: true, description: 'Auto-mounted by the route handler. Exchanges the code, verifies the id_token, links the account.' },
          { label: 'plugins.idpConsumer.unlink(userId, providerId)', mono: true, description: 'Removes a federated link without deleting the local user.' },
        ],
      },
      {
        heading: 'Built-in providers',
        intro:
          'Each preset wires the correct discovery URL, scopes, and profile mapping. The generic `oidc()` provider works with any spec-compliant server — including another holeauth IDP.',
        items: [
          { label: 'providers.google({ clientId, clientSecret })', mono: true, description: 'Uses Google Identity discovery. Scopes default to `openid email profile`.' },
          { label: 'providers.github({ clientId, clientSecret })', mono: true, description: 'GitHub is OAuth2-only — the plugin polyfills the profile fetch.' },
          { label: 'providers.microsoft({ tenant: \'common\' })', mono: true, description: 'Azure AD multi-tenant or single-tenant. Set `tenant` to your directory ID.' },
          { label: 'providers.discord({ scopes: [\'identify\', \'email\'] })', mono: true, description: 'Discord OAuth2 — useful for community-driven apps.' },
          { label: 'providers.oidc({ issuer, clientId, clientSecret })', mono: true, description: 'Generic OIDC. Auto-discovers via `/.well-known/openid-configuration`.' },
        ],
      },
      {
        heading: 'Account linking',
        intro:
          'When a user signs in via a provider, holeauth matches by verified email and links to the existing local user — or creates a new one. Linked identities live in their own table and can be revoked independently.',
        items: [
          { label: 'allowAccountLinking: \'verified-email\'', mono: true, description: 'Default — only auto-link when the provider asserts `email_verified: true`.' },
          { label: 'allowAccountLinking: \'always\'', mono: true, description: 'Link by email regardless of verification. Risky on providers that allow unverified addresses.' },
          { label: 'allowAccountLinking: \'never\'', mono: true, description: 'Always create a new local user — manual linking only.' },
        ],
      },
      {
        heading: 'Per-provider env vars',
        items: [
          { label: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET', mono: true },
          { label: 'GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET', mono: true },
          { label: 'MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET', mono: true },
          { label: 'MY_IDP_ISSUER + MY_IDP_CLIENT_ID + MY_IDP_CLIENT_SECRET', mono: true, description: 'When chaining holeauth IDPs together.' },
        ],
      },
    ],
    docsHref: '/docs/packages/plugin-idp',
  },

  // ── Headless adapter ──────────────────────────────────────────────────────
  {
    slug: 'headless',
    iconName: 'Code2',
    category: 'adapter',
    badge: 'BYO storage · No ORM',
    title: 'Headless',
    tagline: 'No Drizzle. No ORM. Plug holeauth into anything.',
    description:
      'The adapter contract is a tiny set of CRUD methods. Implement it against Prisma, Kysely, MongoDB, Redis, a REST API, or a plain in-memory Map — holeauth does not care. This page shows the full headless flow without any ORM dependency.',
    packages: ['@holeauth/core'],
    installCmd: 'pnpm add @holeauth/core',
    highlights: [
      'Zero ORM dependency',
      'Tiny adapter contract',
      'Works with Prisma, Kysely, Mongo, Redis…',
      'In-memory adapter in ~30 LOC',
      'Same plugins, same types',
      'Edge-compatible (Web Crypto)',
    ],
    steps: [
      {
        step: 1,
        title: 'Install the core',
        description: 'Only `@holeauth/core` — no adapter package required.',
        language: 'bash',
        code: 'pnpm add @holeauth/core',
      },
      {
        step: 2,
        title: 'Implement the adapter contract',
        description:
          'A handful of async CRUD methods. Back them with whatever storage you like — here we use a plain `Map` for clarity.',
        filename: 'lib/memory-adapter.ts',
        language: 'typescript',
        code: `import type { Adapter, User, Session } from '@holeauth/core';

const users    = new Map<string, User>();
const byEmail  = new Map<string, string>();
const sessions = new Map<string, Session>();

export const memoryAdapter = (): Adapter => ({
  // ── Users ──────────────────────────────────────────────────────────────
  async createUser(u) {
    users.set(u.id, u);
    if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    return u;
  },
  async getUserById(id)     { return users.get(id)        ?? null; },
  async getUserByEmail(em)  { const id = byEmail.get(em.toLowerCase());
                              return id ? users.get(id) ?? null : null; },
  async updateUser(id, patch) {
    const u = users.get(id);
    if (!u) return null;
    const next = { ...u, ...patch };
    users.set(id, next);
    return next;
  },

  // ── Sessions ───────────────────────────────────────────────────────────
  async createSession(s)    { sessions.set(s.id, s); return s; },
  async getSessionById(id)  { return sessions.get(id) ?? null; },
  async deleteSession(id)   { sessions.delete(id); },
});`,
      },
      {
        step: 3,
        title: 'Create your auth instance',
        description:
          'Pass the custom adapter — everything else is identical to the Drizzle setup.',
        filename: 'lib/auth.ts',
        language: 'typescript',
        code: `import { createAuth } from '@holeauth/core';
import { memoryAdapter } from './memory-adapter';

export const auth = createAuth({
  adapter: memoryAdapter(),
  session: {
    secret:    process.env.SESSION_SECRET!,
    maxAgeSec: 60 * 60 * 24 * 30,
  },
  baseUrl: process.env.NEXT_PUBLIC_APP_URL!,
});`,
      },
      {
        step: 4,
        title: 'Use it like any other adapter',
        description:
          'Sign-ups, sessions, and plugins all flow through your adapter — no ORM in sight.',
        filename: 'scripts/demo.ts',
        language: 'typescript',
        code: `import { auth } from '../lib/auth';

const user = await auth.signUp({
  email:    'ada@example.com',
  password: 'correct horse battery staple',
});

const { token } = await auth.signIn({
  email:    'ada@example.com',
  password: 'correct horse battery staple',
});

const session = await auth.verifySession(token);
console.log('signed in as', session?.user.email);`,
      },
    ],
    docsHref: '/docs/concepts/adapters',
  },

  // ── Drizzle ────────────────────────────────────────────────────────────────
  {
    slug: 'drizzle',
    iconName: 'Database',
    category: 'adapter',
    badge: 'Postgres · MySQL · SQLite',
    title: 'Drizzle Adapters',
    tagline: 'One schema helper per dialect. Postgres, MySQL, or SQLite — your choice.',
    description:
      'holeauth ships first-party Drizzle adapters for its core and every plugin. Each adapter generates fully-typed schema tables and a runtime adapter object — you never touch raw SQL. Supports Neon, PlanetScale, Turso, Bun SQLite, and any libsql-compatible driver.',
    packages: [
      '@holeauth/adapter-drizzle',
      '@holeauth/2fa-drizzle',
      '@holeauth/passkey-drizzle',
      '@holeauth/rbac-drizzle',
      '@holeauth/idp-drizzle',
    ],
    installCmd: 'pnpm add @holeauth/adapter-drizzle drizzle-orm',
    highlights: [
      'Postgres, MySQL, SQLite',
      'Neon, PlanetScale, Turso',
      'Per-plugin schema helpers',
      'Fully typed, inferred schema',
      'drizzle-kit migration support',
      'One adapter per dialect',
    ],
    steps: [
      {
        step: 1,
        title: 'Install the adapters',
        description: 'Install the core adapter. Add per-plugin adapters as needed.',
        language: 'bash',
        code: `# Core adapter (required)
pnpm add @holeauth/adapter-drizzle drizzle-orm

# Optional: per-plugin adapters
pnpm add @holeauth/2fa-drizzle @holeauth/passkey-drizzle \\
         @holeauth/rbac-drizzle @holeauth/idp-drizzle`,
      },
      {
        step: 2,
        title: 'Define your schema',
        description:
          'Import the table factories for your database dialect and spread into your schema.',
        filename: 'db/schema.ts',
        language: 'typescript',
        code: `// ── Postgres ───────────────────────────────────────────────────
import { pgTable } from 'drizzle-orm/pg-core';
import { createCoreTables }     from '@holeauth/adapter-drizzle/pg';
import { createTotpTable }      from '@holeauth/2fa-drizzle/pg';
import { createPasskeyTable }   from '@holeauth/passkey-drizzle/pg';

export const { users, sessions } = createCoreTables(pgTable);
export const totpSecrets         = createTotpTable(pgTable);
export const passkeyCredentials  = createPasskeyTable(pgTable);

// ── MySQL (swap pgTable → mysqlTable + /mysql import) ──────────
// import { mysqlTable } from 'drizzle-orm/mysql-core';
// import { createCoreTables } from '@holeauth/adapter-drizzle/mysql';

// ── SQLite / Turso ─────────────────────────────────────────────
// import { sqliteTable } from 'drizzle-orm/sqlite-core';
// import { createCoreTables } from '@holeauth/adapter-drizzle/sqlite';`,
      },
      {
        step: 3,
        title: 'Create the DB client',
        description: 'Connect to your database using your preferred driver.',
        filename: 'db/client.ts',
        language: 'typescript',
        code: `// Postgres — Neon serverless
import { drizzle } from 'drizzle-orm/neon-http';
import { neon }    from '@neondatabase/serverless';
import * as schema from './schema';

export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

// ── MySQL — PlanetScale ────────────────────────────────────────
// import { drizzle }  from 'drizzle-orm/planetscale-serverless';
// import { connect }  from '@planetscale/database';
// export const db = drizzle(connect({ url: process.env.DATABASE_URL! }), { schema });

// ── SQLite / Turso ─────────────────────────────────────────────
// import { drizzle }     from 'drizzle-orm/libsql';
// import { createClient } from '@libsql/client';
// export const db = drizzle(createClient({ url: process.env.DATABASE_URL! }), { schema });`,
      },
      {
        step: 4,
        title: 'Pass the adapter to auth',
        description: 'Supply the Drizzle instance and schema tables to the adapter.',
        filename: 'lib/auth.ts',
        language: 'typescript',
        code: `import { createAuth }     from '@holeauth/core';
import { drizzleAdapter }  from '@holeauth/adapter-drizzle';
import { db }              from './db';
import { users, sessions } from '../db/schema';

export const auth = createAuth({
  adapter: drizzleAdapter(db, { users, sessions }),
  session: {
    secret:    process.env.SESSION_SECRET!,
    maxAgeSec: 60 * 60 * 24 * 30,
  },
  baseUrl: process.env.NEXT_PUBLIC_APP_URL!,
});`,
      },
    ],
    docsHref: '/docs/packages/adapter-drizzle',
  },

  // ── Next.js App Router ────────────────────────────────────────────────────
  {
    slug: 'nextjs-app-router',
    iconName: 'Code2',
    category: 'core',
    badge: 'Next.js 15 · App Router',
    title: 'Next.js App Router',
    tagline: 'Catch-all route handler. Server components. Edge-ready.',
    description:
      'The App Router adapter wires holeauth into a single catch-all route. The same `auth` instance is then usable from server components, server actions, middleware, and tRPC — all with full type inference.',
    packages: ['@holeauth/nextjs-app-router'],
    installCmd: 'pnpm add @holeauth/nextjs-app-router',
    highlights: [
      'One catch-all route handler',
      'Server Components support',
      'Server Actions friendly',
      'Edge runtime compatible',
      'next/headers integration',
      'Middleware-ready',
    ],
    steps: [
      {
        step: 1,
        title: 'Install the adapter',
        description: 'Add the Next.js App Router adapter to your project.',
        language: 'bash',
        code: 'pnpm add @holeauth/nextjs-app-router',
      },
      {
        step: 2,
        title: 'Mount the catch-all route',
        description: 'A single route handler serves every auth endpoint.',
        filename: 'app/api/auth/[...holeauth]/route.ts',
        language: 'typescript',
        code: `import { createAuthHandler } from '@holeauth/nextjs-app-router';
import { auth } from '@/lib/auth';

export const { GET, POST } = createAuthHandler({ auth });`,
      },
      {
        step: 3,
        title: 'Read the session in server components',
        description:
          'Use `next/headers` to forward cookies — no extra plumbing required.',
        filename: 'app/dashboard/page.tsx',
        language: 'typescript',
        code: `import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await auth.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  return <h1>Welcome, {session.user.email}</h1>;
}`,
      },
    ],
    docsHref: '/docs/getting-started/nextjs-app-router',
  },

  // ── Next.js Pages Router ─────────────────────────────────────────────────
  {
    slug: 'nextjs-pages-router',
    iconName: 'Code2',
    category: 'core',
    badge: 'Next.js · Pages Router',
    title: 'Next.js Pages Router',
    tagline: 'Drop-in API route handler for the classic Next.js model.',
    description:
      'Run holeauth on the Pages Router with a single API route. Works with `getServerSideProps`, `getStaticProps` revalidation, and middleware — same `auth` instance, same plugins, same type inference.',
    packages: ['@holeauth/nextjs-pages-router'],
    installCmd: 'pnpm add @holeauth/nextjs-pages-router',
    highlights: [
      'Single catch-all API route',
      'getServerSideProps support',
      'Body parser disabled cleanly',
      'Compatible with existing apps',
      'Cookie helpers included',
      'Works alongside App Router',
    ],
    steps: [
      {
        step: 1,
        title: 'Install the adapter',
        description: 'Add the Pages Router adapter.',
        language: 'bash',
        code: 'pnpm add @holeauth/nextjs-pages-router',
      },
      {
        step: 2,
        title: 'Mount the catch-all API route',
        description: 'Disable the body parser — holeauth handles parsing itself.',
        filename: 'pages/api/auth/[...holeauth].ts',
        language: 'typescript',
        code: `import { createPagesAuthHandler } from '@holeauth/nextjs-pages-router';
import { auth } from '@/lib/auth';

export default createPagesAuthHandler({ auth });

export const config = {
  api: { bodyParser: false },
};`,
      },
      {
        step: 3,
        title: 'Read the session in getServerSideProps',
        description: 'Pass the raw request — cookies are read automatically.',
        filename: 'pages/dashboard.tsx',
        language: 'typescript',
        code: `import type { GetServerSideProps } from 'next';
import { auth } from '@/lib/auth';

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const session = await auth.getSession(req);
  if (!session) return { redirect: { destination: '/login', permanent: false } };
  return { props: { email: session.user.email } };
};

export default function Dashboard({ email }: { email: string }) {
  return <h1>Welcome, {email}</h1>;
}`,
      },
    ],
    docsHref: '/docs/getting-started/nextjs-pages-router',
  },

  // ── Express ──────────────────────────────────────────────────────────────
  {
    slug: 'express',
    iconName: 'Code2',
    category: 'core',
    badge: 'Express 4 · Node.js',
    title: 'Express',
    tagline: 'A single `app.use` call mounts every auth endpoint.',
    description:
      'The Express adapter exposes holeauth as standard middleware. Drop it onto any path, integrate with your existing middleware stack, and read the session from request objects with full type safety.',
    packages: ['@holeauth/express'],
    installCmd: 'pnpm add @holeauth/express express',
    highlights: [
      'Standard Express middleware',
      'Works with any router',
      'Cookie + bearer token support',
      'Type-safe request typings',
      'Node.js 18+ supported',
      'No body-parser conflicts',
    ],
    steps: [
      {
        step: 1,
        title: 'Install the adapter',
        description: 'Add the Express adapter alongside Express itself.',
        language: 'bash',
        code: 'pnpm add @holeauth/express express',
      },
      {
        step: 2,
        title: 'Mount the middleware',
        description:
          'One `app.use` call handles every auth endpoint — sign-in, sign-up, refresh, plugins.',
        filename: 'server.ts',
        language: 'typescript',
        code: `import express from 'express';
import { createExpressAuth } from '@holeauth/express';
import { auth } from './lib/auth';

const app = express();

app.use('/api/auth', createExpressAuth({ auth }));

app.listen(3000, () => {
  console.log('listening on http://localhost:3000');
});`,
      },
      {
        step: 3,
        title: 'Read the session on any route',
        description: 'Pass the request — cookies, bearer tokens, and CSRF are handled.',
        filename: 'routes/dashboard.ts',
        language: 'typescript',
        code: `import { Router } from 'express';
import { auth } from '../lib/auth';

export const dashboard = Router();

dashboard.get('/', async (req, res) => {
  const session = await auth.getSession(req);
  if (!session) return res.redirect('/login');
  res.send(\`<h1>Welcome, \${session.user.email}</h1>\`);
});`,
      },
    ],
    docsHref: '/docs/getting-started/express',
  },

  // ── Hono ─────────────────────────────────────────────────────────────────
  {
    slug: 'hono',
    iconName: 'Code2',
    category: 'core',
    badge: 'Hono · Edge / Bun / Node',
    title: 'Hono',
    tagline: 'Edge-native. Bun-ready. Cloudflare Workers tested.',
    description:
      'The Hono adapter mounts holeauth onto any Hono app — including Cloudflare Workers, Bun, Deno, and Node. Reads sessions from the raw `Request`, plays nicely with Hono middleware, and runs at the edge with zero ceremony.',
    packages: ['@holeauth/hono'],
    installCmd: 'pnpm add @holeauth/hono hono',
    highlights: [
      'Cloudflare Workers ready',
      'Bun and Deno support',
      'Standard Web Request API',
      'Edge runtime native',
      'Composable with Hono middleware',
      'Tiny bundle footprint',
    ],
    steps: [
      {
        step: 1,
        title: 'Install the adapter',
        description: 'Add the Hono adapter and Hono itself.',
        language: 'bash',
        code: 'pnpm add @holeauth/hono hono',
      },
      {
        step: 2,
        title: 'Mount the auth handler',
        description: 'Register on `/api/auth/*` — every HTTP verb is forwarded.',
        filename: 'app.ts',
        language: 'typescript',
        code: `import { Hono } from 'hono';
import { createHonoAuth } from '@holeauth/hono';
import { auth } from './lib/auth';

const app = new Hono();

app.on(['GET', 'POST'], '/api/auth/*', createHonoAuth({ auth }));

export default app;`,
      },
      {
        step: 3,
        title: 'Read the session in any handler',
        description: 'Pass the raw Web `Request` — works at the edge.',
        filename: 'routes/dashboard.ts',
        language: 'typescript',
        code: `import { Hono } from 'hono';
import { auth } from '../lib/auth';

export const dashboard = new Hono();

dashboard.get('/', async (c) => {
  const session = await auth.getSession(c.req.raw);
  if (!session) return c.redirect('/login');
  return c.html(\`<h1>Welcome, \${session.user.email}</h1>\`);
});`,
      },
    ],
    docsHref: '/docs/getting-started/hono',
  },
];

export const FEATURES_BY_SLUG = Object.fromEntries(
  FEATURES_DATA.map((f) => [f.slug, f]),
) as Record<string, FeatureData>;

export const FEATURES_BY_CATEGORY = {
  core:    FEATURES_DATA.filter((f) => f.category === 'core'),
  plugin:  FEATURES_DATA.filter((f) => f.category === 'plugin'),
  adapter: FEATURES_DATA.filter((f) => f.category === 'adapter'),
};
