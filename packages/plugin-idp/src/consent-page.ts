/**
 * Minimal HTML escaping for the consent screen. We render inline HTML
 * rather than pulling in a template engine — the consent page is tiny
 * and needs to be controllable for security (CSP, no script, etc.).
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ConsentPageInput {
  appName: string;
  appLogoUrl: string | null;
  scopes: string[];
  userEmail: string;
  /** All authorize params to echo back in the form. */
  params: Record<string, string>;
  /** CSRF token embedded in the form. */
  csrf: string;
  /** The path this form POSTs to (e.g. /api/auth/oauth2/authorize/consent). */
  actionPath: string;
  /** Friendly labels for well-known scopes. */
  scopeLabels?: Record<string, string>;
}

const DEFAULT_SCOPE_LABELS: Record<string, string> = {
  openid: 'Sign you in',
  profile: 'See your name and profile picture',
  email: 'See your email address',
  offline_access: 'Stay signed in (refresh tokens)',
};

export function renderConsentPage(input: ConsentPageInput): string {
  const labels = { ...DEFAULT_SCOPE_LABELS, ...(input.scopeLabels ?? {}) };
  const scopeItems = input.scopes
    .map((s) => {
      const label = labels[s] ?? s;
      return `<li><code>${escapeHtml(s)}</code> — ${escapeHtml(label)}</li>`;
    })
    .join('');
  const hidden = Object.entries(input.params)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`,
    )
    .join('');
  const logo = input.appLogoUrl
    ? `<img src="${escapeHtml(input.appLogoUrl)}" alt="" style="width:64px;height:64px;border-radius:12px;object-fit:cover;" />`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Authorize ${escapeHtml(input.appName)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; max-width: 440px; margin: 48px auto; padding: 0 16px; }
    .card { border: 1px solid rgba(127,127,127,.3); border-radius: 12px; padding: 24px; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    ul { padding-left: 1.2em; }
    .actions { display: flex; gap: 8px; margin-top: 16px; }
    button { padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(127,127,127,.4); background: transparent; cursor: pointer; font-size: 0.95rem; }
    button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    .header { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      ${logo}
      <div>
        <h1>${escapeHtml(input.appName)}</h1>
        <p style="margin:0;opacity:0.7;font-size:0.9rem;">wants to access your account</p>
      </div>
    </div>
    <p>Signed in as <strong>${escapeHtml(input.userEmail)}</strong>. This app is requesting:</p>
    <ul>${scopeItems}</ul>
    <form method="POST" action="${escapeHtml(input.actionPath)}">
      ${hidden}
      <input type="hidden" name="csrfToken" value="${escapeHtml(input.csrf)}" />
      <div class="actions">
        <button type="submit" name="decision" value="deny">Deny</button>
        <button class="primary" type="submit" name="decision" value="approve">Allow</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}
