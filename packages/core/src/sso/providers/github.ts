import type { OAuth2ProviderConfig } from '../../types/index.js';

export interface GithubOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  id?: string;
  scopes?: string[];
}

/** GitHub OAuth2 provider. Uses REST userinfo (no OIDC). */
export function GithubProvider(opts: GithubOptions): OAuth2ProviderConfig {
  return {
    kind: 'oauth2',
    id: opts.id ?? 'github',
    name: 'GitHub',
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    redirectUri: opts.redirectUri,
    scopes: opts.scopes ?? ['read:user', 'user:email'],
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userinfoUrl: 'https://api.github.com/user',
    profile: (raw) => {
      const p = (raw ?? {}) as {
        id?: number | string;
        login?: string;
        email?: string | null;
        name?: string | null;
        avatar_url?: string | null;
      };
      return {
        providerAccountId: String(p.id ?? p.login ?? ''),
        email: p.email ?? '',
        name: p.name ?? p.login ?? null,
        image: p.avatar_url ?? null,
      };
    },
  };
}
