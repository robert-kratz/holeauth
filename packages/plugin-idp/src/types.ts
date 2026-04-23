/**
 * Shared types for @holeauth/plugin-idp.
 *
 * These describe the OIDC/OAuth2 entities the plugin stores and operates on.
 * Storage-concrete shapes (drizzle, etc.) live in @holeauth/idp-drizzle.
 */

export type AppType = 'confidential' | 'public';

export type TeamRole = 'owner' | 'developer';

export interface IdpApp {
  /** Used as OAuth `client_id`. UUID. */
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  type: AppType;
  /** SHA-256 of the secret; only confidential apps carry one. */
  clientSecretHash: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  requirePkce: boolean;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
}

export interface IdpTeam {
  id: string;
  name: string;
  createdAt: Date;
}

export interface IdpTeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  addedAt: Date;
}

export interface IdpAuthorizationCode {
  codeHash: string;
  appId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  nonce: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: 'S256' | 'plain' | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface IdpRefreshToken {
  id: string;
  tokenHash: string;
  appId: string;
  userId: string;
  familyId: string;
  scope: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface IdpConsent {
  userId: string;
  appId: string;
  scopesGranted: string[];
  grantedAt: Date;
}

export type SigningAlg = 'RS256' | 'EdDSA';

export interface IdpSigningKey {
  kid: string;
  alg: SigningAlg;
  /** Public JWK (safe to expose via /jwks). */
  publicJwk: Record<string, unknown>;
  /** Private JWK — store encrypted at rest in production. */
  privateJwk: Record<string, unknown>;
  active: boolean;
  createdAt: Date;
  rotatedAt: Date | null;
}

/* ───────────────────────── inputs to adapter writes ───────────────────────── */

export interface CreateAppInput {
  id: string;
  teamId: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  type: AppType;
  clientSecretHash?: string | null;
  redirectUris: string[];
  allowedScopes: string[];
  requirePkce: boolean;
}

export interface UpdateAppInput {
  name?: string;
  description?: string | null;
  logoUrl?: string | null;
  redirectUris?: string[];
  allowedScopes?: string[];
  requirePkce?: boolean;
  clientSecretHash?: string | null;
  disabledAt?: Date | null;
}

export interface CreateAuthorizationCodeInput {
  codeHash: string;
  appId: string;
  userId: string;
  redirectUri: string;
  scope: string;
  nonce: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: 'S256' | 'plain' | null;
  expiresAt: Date;
}

export interface CreateRefreshTokenInput {
  id: string;
  tokenHash: string;
  appId: string;
  userId: string;
  familyId: string;
  scope: string;
  expiresAt: Date;
}

export interface CreateSigningKeyInput {
  kid: string;
  alg: SigningAlg;
  publicJwk: Record<string, unknown>;
  privateJwk: Record<string, unknown>;
}
