import type { HoleauthConfig, IssuedTokens, ProviderConfig } from '../types/index.js';
import type { AdapterUser } from '../adapters/index.js';
import { findProvider } from './authorize.js';
import { exchangeCode, fetchUserInfo } from './client.js';
import { decode } from '../jwt/index.js';
import { issueSession } from '../session/issue.js';
import { AccountConflictError, ProviderError } from '../errors/index.js';
import { emit } from '../events/emitter.js';

export interface CallbackInput {
  code: string;
  state: string;
  codeVerifier: string;
  ip?: string;
  userAgent?: string;
}

interface NormalisedProfile {
  providerAccountId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified: boolean;
}

async function exchangeAndProfile(
  p: ProviderConfig,
  input: CallbackInput,
): Promise<{ tokens: Record<string, unknown>; profile: NormalisedProfile }> {
  const tokens = await exchangeCode({
    tokenUrl: p.tokenUrl,
    clientId: p.clientId,
    clientSecret: p.clientSecret,
    redirectUri: p.redirectUri,
    code: input.code,
    codeVerifier: input.codeVerifier,
  });

  const accessToken = typeof tokens.access_token === 'string' ? tokens.access_token : null;
  if (!accessToken) throw new ProviderError('no access_token in response');

  if (p.kind === 'oidc') {
    const idToken = typeof tokens.id_token === 'string' ? tokens.id_token : null;
    if (idToken) {
      const claims = decode<{
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      }>(idToken);
      if (claims.sub && claims.email) {
        return {
          tokens,
          profile: {
            providerAccountId: claims.sub,
            email: claims.email.toLowerCase(),
            name: claims.name ?? null,
            image: claims.picture ?? null,
            emailVerified: claims.email_verified ?? false,
          },
        };
      }
    }
    // Fall back to userinfo
    const ui = await fetchUserInfo(p.userinfoUrl, accessToken);
    const sub = (ui.sub ?? '') as string;
    const email = typeof ui.email === 'string' ? ui.email.toLowerCase() : '';
    if (!sub || !email) throw new ProviderError('userinfo missing sub/email');
    return {
      tokens,
      profile: {
        providerAccountId: sub,
        email,
        name: (ui.name as string | null) ?? null,
        image: (ui.picture as string | null) ?? null,
        emailVerified: Boolean(ui.email_verified),
      },
    };
  }

  // oauth2
  const raw = await fetchUserInfo(p.userinfoUrl, accessToken);
  const mapped = p.profile(raw);
  if (!mapped.providerAccountId) throw new ProviderError('provider profile missing id');
  // GitHub may return null email — fall back to /user/emails.
  let email = mapped.email.toLowerCase();
  let verified = false;
  if (!email && p.id === 'github') {
    const emails = (await fetchUserInfo('https://api.github.com/user/emails', accessToken)) as unknown as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary) : undefined;
    if (primary) {
      email = primary.email.toLowerCase();
      verified = primary.verified;
    }
  }
  if (!email) throw new ProviderError('provider did not return an email');
  return {
    tokens,
    profile: {
      providerAccountId: mapped.providerAccountId,
      email,
      name: mapped.name ?? null,
      image: mapped.image ?? null,
      emailVerified: verified,
    },
  };
}

async function resolveUser(
  cfg: HoleauthConfig,
  provider: ProviderConfig,
  profile: NormalisedProfile,
  rawTokens: Record<string, unknown>,
): Promise<AdapterUser> {
  const account = cfg.adapters.account;

  // 1. Try existing link
  if (account) {
    const existing = await account.getAccountByProvider(provider.id, profile.providerAccountId);
    if (existing) {
      const u = await cfg.adapters.user.getUserById(existing.userId);
      if (u) return u;
    }
  }

  // 2. Try user by email (potential linking)
  const byEmail = await cfg.adapters.user.getUserByEmail(profile.email);
  if (byEmail) {
    if (!cfg.allowDangerousEmailAccountLinking || !profile.emailVerified) {
      throw new AccountConflictError(
        `an account with email ${profile.email} already exists; enable allowDangerousEmailAccountLinking or sign in with password first`,
      );
    }
    // Auto-link
    if (account) {
      const linked = await account.linkAccount({
        userId: byEmail.id,
        provider: provider.id,
        providerAccountId: profile.providerAccountId,
        email: profile.email,
        accessToken: (rawTokens.access_token as string) ?? null,
        refreshToken: (rawTokens.refresh_token as string) ?? null,
        idToken: (rawTokens.id_token as string) ?? null,
        tokenType: (rawTokens.token_type as string) ?? null,
        scope: (rawTokens.scope as string) ?? null,
        expiresAt: typeof rawTokens.expires_in === 'number'
          ? new Date(Date.now() + (rawTokens.expires_in as number) * 1000)
          : null,
      });
      await emit(cfg, {
        type: 'account.linked',
        userId: byEmail.id,
        data: { provider: provider.id, accountId: linked.id, auto: true },
      });
    }
    return byEmail;
  }

  // 3. Create user + (maybe) link
  const user = await cfg.adapters.user.createUser({
    email: profile.email,
    name: profile.name ?? null,
    image: profile.image ?? null,
    emailVerified: profile.emailVerified ? new Date() : null,
  });
  if (account) {
    const linked = await account.linkAccount({
      userId: user.id,
      provider: provider.id,
      providerAccountId: profile.providerAccountId,
      email: profile.email,
      accessToken: (rawTokens.access_token as string) ?? null,
      refreshToken: (rawTokens.refresh_token as string) ?? null,
      idToken: (rawTokens.id_token as string) ?? null,
      tokenType: (rawTokens.token_type as string) ?? null,
      scope: (rawTokens.scope as string) ?? null,
      expiresAt: typeof rawTokens.expires_in === 'number'
        ? new Date(Date.now() + (rawTokens.expires_in as number) * 1000)
        : null,
    });
    await emit(cfg, {
      type: 'account.linked',
      userId: user.id,
      data: { provider: provider.id, accountId: linked.id, onCreate: true },
    });
  }
  return user;
}

export async function callback(
  cfg: HoleauthConfig,
  providerId: string,
  input: CallbackInput,
): Promise<{ user: AdapterUser; tokens: IssuedTokens }> {
  const p = findProvider(cfg, providerId);
  try {
    const { tokens: rawTokens, profile } = await exchangeAndProfile(p, input);
    const user = await resolveUser(cfg, p, profile, rawTokens);

    const tokens = await issueSession(cfg, {
      userId: user.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    await emit(cfg, {
      type: 'sso.callback_ok',
      userId: user.id,
      sessionId: tokens.sessionId,
      data: { provider: providerId },
    });
    return { user, tokens };
  } catch (e) {
    await emit(cfg, {
      type: 'sso.callback_failed',
      data: { provider: providerId, error: (e as Error).message },
    });
    throw e;
  }
}
