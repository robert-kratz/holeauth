import type { OIDCProviderConfig } from '../../types/index.js';

export interface MicrosoftOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /**
   * Microsoft tenant. Common values:
   *   - 'common'          → both work + school and personal accounts
   *   - 'organizations'   → work + school only
   *   - 'consumers'       → personal Microsoft accounts only
   *   - '<tenant-guid>'   → a specific Azure AD tenant
   *
   * Default: 'common'.
   */
  tenantId?: string;
  id?: string;
  scopes?: string[];
}

/**
 * Microsoft Identity Platform (Azure AD / Entra ID) OpenID Connect provider.
 *
 * Note: the issuer for tenant 'common' is technically per-tenant at runtime
 * (`https://login.microsoftonline.com/{tid}/v2.0`). We expose the multi-tenant
 * issuer string; callers that need strict issuer validation should pin a
 * specific tenant ID.
 */
export function MicrosoftProvider(opts: MicrosoftOptions): OIDCProviderConfig {
  const tenant = opts.tenantId ?? 'common';
  const base = `https://login.microsoftonline.com/${tenant}`;
  return {
    kind: 'oidc',
    id: opts.id ?? 'microsoft',
    name: 'Microsoft',
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    redirectUri: opts.redirectUri,
    scopes: opts.scopes ?? ['openid', 'email', 'profile'],
    issuer: `${base}/v2.0`,
    authorizationUrl: `${base}/oauth2/v2.0/authorize`,
    tokenUrl: `${base}/oauth2/v2.0/token`,
    userinfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
  };
}
