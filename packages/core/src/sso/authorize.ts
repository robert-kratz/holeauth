import type { HoleauthConfig, ProviderConfig } from '../types/index.js';
import { ProviderError } from '../errors/index.js';
import { buildAuthorizeUrl, generatePkcePair, generateState, generateNonce } from './client.js';
import { emit } from '../events/emitter.js';

export function findProvider(cfg: HoleauthConfig, id: string): ProviderConfig {
  const p = cfg.providers?.find((x) => x.id === id);
  if (!p) throw new ProviderError(`unknown provider: ${id}`);
  return p;
}

/**
 * Begin the SSO hop. Returns a URL to redirect the user to, plus state +
 * PKCE verifier the caller must persist (typically in httpOnly cookies)
 * to validate the callback.
 */
export async function authorize(
  cfg: HoleauthConfig,
  providerId: string,
): Promise<{ url: string; state: string; codeVerifier: string; nonce?: string }> {
  const p = findProvider(cfg, providerId);
  const state = generateState();
  const { verifier, challenge } = await generatePkcePair();
  const nonce = p.kind === 'oidc' ? generateNonce() : undefined;

  const url = buildAuthorizeUrl({
    issuerAuthUrl: p.authorizationUrl,
    clientId: p.clientId,
    redirectUri: p.redirectUri,
    scopes: p.scopes,
    state,
    codeChallenge: challenge,
    nonce,
  });

  await emit(cfg, { type: 'sso.authorize', data: { provider: providerId } });
  return { url, state, codeVerifier: verifier, nonce };
}
