import type { OIDCProviderConfig } from '../../types/index.js';

export interface OIDCOptions {
  /** Provider id (used as the `:provider` URL segment). */
  id: string;
  /** Display name. */
  name?: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** OIDC issuer (used for ID token `iss` validation). */
  issuer: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scopes?: string[];
}

/**
 * Generic OpenID Connect provider. Use this for any spec-compliant OIDC
 * Identity Provider (Keycloak, Auth0, Okta, Authentik, holeauth-as-IDP, …).
 *
 * Endpoint discovery is currently the caller's responsibility — fetch
 * `${issuer}/.well-known/openid-configuration` and pass the resulting URLs.
 */
export function OIDCProvider(opts: OIDCOptions): OIDCProviderConfig {
  return {
    kind: 'oidc',
    id: opts.id,
    name: opts.name ?? opts.id,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    redirectUri: opts.redirectUri,
    scopes: opts.scopes ?? ['openid', 'email', 'profile'],
    issuer: opts.issuer,
    authorizationUrl: opts.authorizationUrl,
    tokenUrl: opts.tokenUrl,
    userinfoUrl: opts.userinfoUrl,
  };
}
