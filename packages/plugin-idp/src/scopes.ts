/**
 * Scope handling + claim mapping for OIDC.
 *
 * Built-in scopes:
 *   openid   → required for OIDC; adds `sub` claim
 *   profile  → adds `name`, `preferred_username`, `picture`
 *   email    → adds `email`, `email_verified`
 *   offline_access → authorizes refresh_token issuance
 */
import type { AdapterUser } from '@holeauth/core/adapters';

export const BUILTIN_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const;

export function parseScope(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(/\s+/).filter(Boolean);
}

export function formatScope(scopes: string[]): string {
  return Array.from(new Set(scopes)).join(' ');
}

/**
 * Given requested scopes and allowed scopes for the app, return the
 * intersection (what will actually be granted).
 */
export function intersectScopes(requested: string[], allowed: string[]): string[] {
  const set = new Set(allowed);
  return requested.filter((s) => set.has(s));
}

/** Produce OIDC claims for an id_token based on granted scopes. */
export function claimsForUser(user: AdapterUser, scopes: string[]): Record<string, unknown> {
  const claims: Record<string, unknown> = {};
  if (scopes.includes('profile')) {
    if (user.name != null) claims.name = user.name;
    if (user.name != null) claims.preferred_username = user.name;
    if (user.image != null) claims.picture = user.image;
  }
  if (scopes.includes('email')) {
    claims.email = user.email;
    claims.email_verified = user.emailVerified != null;
  }
  return claims;
}
