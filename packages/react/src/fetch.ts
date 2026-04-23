/**
 * CSRF-aware `fetch` wrapper. Reads the CSRF cookie (`<prefix>.csrf`) and
 * injects `x-csrf-token` on state-changing requests. Always sends cookies.
 *
 * Works in browsers only (reads `document.cookie`). On the server it falls
 * back to a plain `fetch`.
 */
export interface HoleauthFetchOptions extends RequestInit {
  /** Cookie prefix used when the handler was configured. Default `holeauth`. */
  cookiePrefix?: string;
  /** Custom CSRF header name. Default `x-csrf-token`. */
  csrfHeader?: string;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const parts = document.cookie.split('; ');
  for (const p of parts) {
    if (p.startsWith(prefix)) return decodeURIComponent(p.slice(prefix.length));
  }
  return null;
}

export async function holeauthFetch(input: RequestInfo | URL, opts: HoleauthFetchOptions = {}) {
  const {
    cookiePrefix = 'holeauth',
    csrfHeader = 'x-csrf-token',
    headers,
    method = 'GET',
    ...rest
  } = opts;

  const h = new Headers(headers);
  const isMutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (isMutation) {
    const token = readCookie(`${cookiePrefix}.csrf`);
    if (token && !h.has(csrfHeader)) h.set(csrfHeader, token);
  }
  if (rest.body && !h.has('content-type') && typeof rest.body === 'string') {
    h.set('content-type', 'application/json');
  }

  return fetch(input, {
    credentials: 'include',
    ...rest,
    method,
    headers: h,
  });
}
