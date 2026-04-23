import type {
  UserAdapter,
  SessionAdapter,
  AccountAdapter,
  VerificationTokenAdapter,
  AuditLogAdapter,
  TransactionAdapter,
  AdapterUser,
} from '../adapters/index.js';
import type { HoleauthEvent } from '../events/types.js';
import type { HoleauthPlugin } from '../plugins/types.js';

export interface TokenPolicy {
  /** Access token lifetime in seconds. Default: 900 (15m). */
  accessTtl?: number;
  /** Refresh token lifetime in seconds. Default: 2592000 (30d). */
  refreshTtl?: number;
  /** Pending challenge cookie lifetime. Default: 300 (5m). */
  pendingTtl?: number;
  /** Cookie name prefix. Default: 'holeauth'. */
  cookiePrefix?: string;
  /** Optional cookie Domain attribute (e.g. '.example.com'). */
  cookieDomain?: string;
  /** Override Secure flag for cookies (auto-true in production). */
  cookieSecure?: boolean;
  /** SameSite. Default: 'lax'. SSO callbacks always bypass to avoid drops. */
  sameSite?: 'lax' | 'strict' | 'none';
}

export interface HoleauthSecrets {
  /** JWT signing secret (or asymmetric key material). */
  jwtSecret: string | Uint8Array;
}

/* ─────────────────────── OAuth/OIDC providers ───────────────── */
export interface BaseProviderConfig {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
}

export interface OIDCProviderConfig extends BaseProviderConfig {
  kind: 'oidc';
  issuer: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
}

export interface OAuth2ProviderConfig extends BaseProviderConfig {
  kind: 'oauth2';
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  /** Map provider-specific profile to a normalised shape. */
  profile: (raw: unknown) => {
    providerAccountId: string;
    email: string;
    name?: string | null;
    image?: string | null;
  };
}

export type ProviderConfig = OIDCProviderConfig | OAuth2ProviderConfig;

/* ─────────────────────────── Adapters ──────────────────────── */
export interface HoleauthAdapters {
  user: UserAdapter;
  session: SessionAdapter;
  /** MANDATORY — persisted audit log (awaited). */
  auditLog: AuditLogAdapter;
  account?: AccountAdapter;
  verificationToken?: VerificationTokenAdapter;
  /** Optional — wraps multi-step writes in a DB transaction when provided. */
  transaction?: TransactionAdapter;
}

export interface LoggerOptions {
  silent?: boolean;
}

/* ─────────────────────── Registration / Invites ─────────────────────── */
export interface RegistrationConfig {
  /**
   * If `false`, the public `register` flow throws `REGISTRATION_DISABLED` (403).
   * Invites continue to work regardless. Default: `true`.
   */
  selfServe?: boolean;
  /** Default TTL (seconds) for invite tokens when callers do not pass one. */
  inviteTtlSeconds?: number;
  /**
   * Builder for the user-visible invite acceptance URL. Called by
   * `createInvite`; returning `undefined` omits the `url` field from the
   * result and leaves URL construction to the caller.
   */
  inviteUrl?: (args: { token: string; email: string }) => string | undefined;
}

/* ────────────────────────── Options ─────────────────────────── */
export interface HoleauthConfig {
  secrets: HoleauthSecrets;
  adapters: HoleauthAdapters;
  tokens?: TokenPolicy;
  providers?: ProviderConfig[];
  /** Plugins to register. See `@holeauth/core/plugins`. */
  plugins?: readonly HoleauthPlugin<string, unknown>[];
  /**
   * Per-plugin adapter map, keyed by plugin id. Preferred over embedding
   * adapters inside each plugin's options closure — keeps adapters in one
   * place and out of serialisable plugin configuration.
   *
   * Access inside a plugin via `ctx.getPluginAdapter<T>(id)`.
   */
  pluginAdapters?: Record<string, unknown>;
  /** Allow auto-linking on matching verified email (UNSAFE when provider does not verify email). */
  allowDangerousEmailAccountLinking?: boolean;
  /** Registration / invite configuration. */
  registration?: RegistrationConfig;
  /** Legacy single-listener event hook. Still supported; new code should use `events.on(...)`. */
  onEvent?: (e: HoleauthEvent) => void | Promise<void>;
  logger?: LoggerOptions;
}

/* ─────────────────────────── Session ────────────────────────── */
export interface SessionData {
  userId: string;
  sessionId: string;
  expiresAt: number;
  [key: string]: unknown;
}

/* ─────────────────────────── Flows ──────────────────────────── */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  sessionId: string;
  familyId: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

/**
 * A signIn outcome.
 *   - `ok`: fully authenticated; tokens ready to be set as cookies.
 *   - `pending`: a plugin's challenge hook halted the flow. The caller
 *     must drive the plugin's follow-up verification step. `pluginId`
 *     identifies which plugin issued the challenge.
 */
export type SignInResult =
  | { kind: 'ok'; user: AdapterUser; tokens: IssuedTokens }
  | {
      kind: 'pending';
      pluginId: string;
      userId: string;
      pendingToken: string;
      pendingExpiresAt: number;
      data?: Record<string, unknown> | null;
    };

/* ─────────────────────────── Invites ────────────────────────── */
export interface InviteInput {
  email: string;
  name?: string | null;
  /** RBAC group ids to assign on consume. Consumer/plugin hooks handle assignment. */
  groupIds?: string[];
  /** User id of the admin creating the invite (for audit). */
  invitedBy?: string | null;
  /** Opaque metadata stored in the JWT claim `meta`. */
  metadata?: Record<string, unknown> | null;
  /** Override default TTL (seconds). Falls back to `registration.inviteTtlSeconds`. */
  ttlSeconds?: number;
}
export interface InviteClaims {
  /** Target email (JWT subject). */
  email: string;
  name?: string | null;
  groupIds?: string[];
  invitedBy?: string | null;
  metadata?: Record<string, unknown> | null;
  expiresAt: number;
  /** JWT id; also the verification token identifier. */
  identifier: string;
}
export interface CreateInviteResult {
  token: string;
  url?: string;
  identifier: string;
  expiresAt: number;
}
export interface ConsumeInviteInput {
  token: string;
  password: string;
  name?: string;
  autoSignIn?: boolean;
  ip?: string;
  userAgent?: string;
}
export interface ConsumeInviteResult {
  user: AdapterUser;
  tokens?: IssuedTokens;
  groupIds?: string[];
}
export interface InviteListEntry {
  identifier: string;
  email: string;
  expiresAt: number;
}

export interface HoleauthInstance {
  config: HoleauthConfig;
  register(input: { email: string; password: string; name?: string }): Promise<AdapterUser>;
  signIn(input: { email: string; password: string; ip?: string; userAgent?: string }): Promise<SignInResult>;
  signOut(input: { accessToken?: string; refreshToken?: string }): Promise<void>;
  refresh(input: { refreshToken: string; ip?: string; userAgent?: string }): Promise<IssuedTokens>;
  getSession(accessToken?: string): Promise<SessionData | null>;

  changePassword(input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
  }): Promise<void>;
  requestPasswordReset(input: { email: string }): Promise<{ token?: string; userId?: string }>;
  consumePasswordReset(input: { email: string; token: string; newPassword: string }): Promise<void>;

  updateUser(userId: string, patch: Partial<AdapterUser>): Promise<AdapterUser>;
  deleteUser(userId: string): Promise<void>;

  /* Invites */
  createInvite(input: InviteInput): Promise<CreateInviteResult>;
  getInviteInfo(input: { token: string }): Promise<InviteClaims>;
  consumeInvite(input: ConsumeInviteInput): Promise<ConsumeInviteResult>;
  revokeInvite(input: { identifier: string }): Promise<void>;
  listInvites(): Promise<InviteListEntry[]>;

  sso: {
    authorize(providerId: string): Promise<{ url: string; state: string; codeVerifier: string; nonce?: string }>;
    callback(
      providerId: string,
      input: { code: string; state: string; codeVerifier: string; ip?: string; userAgent?: string },
    ): Promise<{ user: AdapterUser; tokens: IssuedTokens }>;
  };
}
