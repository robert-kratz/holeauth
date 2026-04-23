import type { OIDCProviderConfig } from '../../types/index.js';

export interface GoogleOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  id?: string;
  scopes?: string[];
}

/** Google OpenID Connect provider. */
export function GoogleProvider(opts: GoogleOptions): OIDCProviderConfig {
  return {
    kind: 'oidc',
    id: opts.id ?? 'google',
    name: 'Google',
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    redirectUri: opts.redirectUri,
    scopes: opts.scopes ?? ['openid', 'email', 'profile'],
    issuer: 'https://accounts.google.com',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  };
}
