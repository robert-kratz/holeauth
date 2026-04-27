/**
 * Tests for the consent-page HTML renderer.
 */
import { describe, it, expect } from 'vitest';
import { renderConsentPage } from '../src/consent-page.js';

describe('renderConsentPage', () => {
  const base = {
    appName: 'Test App',
    appLogoUrl: null,
    scopes: ['openid', 'profile'],
    userEmail: 'user@example.com',
    params: { client_id: 'abc', redirect_uri: 'https://rp/cb' },
    csrf: 'csrf-token',
    actionPath: '/api/auth/oauth2/authorize/consent',
  };

  it('renders the app name and scopes', () => {
    const html = renderConsentPage(base);
    expect(html).toContain('<title>Authorize Test App</title>');
    expect(html).toContain('<code>openid</code> — Sign you in');
    expect(html).toContain('<code>profile</code> — See your name');
  });

  it('escapes dangerous characters in inputs', () => {
    const html = renderConsentPage({
      ...base,
      appName: '<script>alert(1)</script>',
      userEmail: 'evil"&',
      params: { x: '<y>' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('evil&quot;&amp;');
    expect(html).toContain('value="&lt;y&gt;"');
  });

  it('includes the logo img tag when appLogoUrl is set', () => {
    const html = renderConsentPage({ ...base, appLogoUrl: 'https://logo.example' });
    expect(html).toContain('<img src="https://logo.example"');
  });

  it('omits the logo img tag when appLogoUrl is null', () => {
    const html = renderConsentPage(base);
    expect(html).not.toContain('<img ');
  });

  it('renders description and redirect info when provided', () => {
    const html = renderConsentPage({
      ...base,
      appDescription: 'A cool app',
      redirectUri: 'https://rp/cb',
    });
    expect(html).toContain('A cool app');
    expect(html).toContain('After approval you will be redirected');
    expect(html).toContain('https://rp/cb');
  });

  it('falls back to the scope id when no label is known', () => {
    const html = renderConsentPage({ ...base, scopes: ['custom.scope'] });
    expect(html).toContain('<code>custom.scope</code> — custom.scope');
  });

  it('accepts custom scopeLabels overrides', () => {
    const html = renderConsentPage({
      ...base,
      scopes: ['custom'],
      scopeLabels: { custom: 'Custom label' },
    });
    expect(html).toContain('Custom label');
  });

  it('emits hidden inputs for all params + csrf token', () => {
    const html = renderConsentPage(base);
    expect(html).toContain('<input type="hidden" name="client_id" value="abc"');
    expect(html).toContain('<input type="hidden" name="redirect_uri" value="https://rp/cb"');
    expect(html).toContain('<input type="hidden" name="csrfToken" value="csrf-token"');
  });

  it('points the form at actionPath', () => {
    const html = renderConsentPage({ ...base, actionPath: '/custom/consent' });
    expect(html).toContain('action="/custom/consent"');
  });
});
