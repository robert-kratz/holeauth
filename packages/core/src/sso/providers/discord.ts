import type { OAuth2ProviderConfig } from '../../types/index.js';

export interface DiscordOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  id?: string;
  scopes?: string[];
}

/** Discord OAuth2 provider. Uses REST userinfo (no OIDC discovery). */
export function DiscordProvider(opts: DiscordOptions): OAuth2ProviderConfig {
  return {
    kind: 'oauth2',
    id: opts.id ?? 'discord',
    name: 'Discord',
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    redirectUri: opts.redirectUri,
    scopes: opts.scopes ?? ['identify', 'email'],
    authorizationUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userinfoUrl: 'https://discord.com/api/users/@me',
    profile: (raw) => {
      const p = (raw ?? {}) as {
        id?: string;
        username?: string;
        global_name?: string | null;
        email?: string | null;
        avatar?: string | null;
      };
      const id = String(p.id ?? '');
      const image =
        id && p.avatar ? `https://cdn.discordapp.com/avatars/${id}/${p.avatar}.png` : null;
      return {
        providerAccountId: id,
        email: p.email ?? '',
        name: p.global_name ?? p.username ?? null,
        image,
      };
    },
  };
}
