/**
 * Optional React sub-path for @holeauth/plugin-magic-link.
 *
 * Subpath: `@holeauth/plugin-magic-link/react`
 *
 * These hooks are thin fetch wrappers around the plugin's auto-mounted
 * routes (`/api/auth/magic-link/*`). They do not depend on any specific
 * router and can be used from server components via `request()` indirectly
 * — but are primarily intended for client components.
 */
import { useCallback, useState } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';

export interface UseMagicLinkOptions {
  /** Base path for the holeauth route handler. Default: `/api/auth`. */
  basePath?: string;
  /** Optional CSRF token to send in the `x-csrf-token` header. */
  csrfToken?: string | null;
}

export interface UseMagicLinkResult {
  request: (email: string, type?: 'magic-link' | 'otp') => Promise<void>;
  status: Status;
  error: string | null;
  reset: () => void;
}

export function useMagicLink(opts: UseMagicLinkOptions = {}): UseMagicLinkResult {
  const base = opts.basePath ?? '/api/auth';
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    async (email: string, type?: 'magic-link' | 'otp') => {
      setStatus('loading');
      setError(null);
      try {
        const res = await fetch(`${base}/magic-link/request`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            ...(opts.csrfToken ? { 'x-csrf-token': opts.csrfToken } : {}),
          },
          body: JSON.stringify({ email, ...(type ? { type } : {}) }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { code?: string; message?: string } }
            | null;
          throw new Error(body?.error?.code ?? `HTTP_${res.status}`);
        }
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'UNKNOWN_ERROR');
      }
    },
    [base, opts.csrfToken],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { request, status, error, reset };
}

export interface UseVerifyOtpResult {
  verify: (email: string, code: string) => Promise<{ ok: boolean }>;
  status: Status;
  error: string | null;
  reset: () => void;
}

export function useVerifyOtp(opts: UseMagicLinkOptions = {}): UseVerifyOtpResult {
  const base = opts.basePath ?? '/api/auth';
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(
    async (email: string, code: string) => {
      setStatus('loading');
      setError(null);
      try {
        const res = await fetch(`${base}/magic-link/verify-otp`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            ...(opts.csrfToken ? { 'x-csrf-token': opts.csrfToken } : {}),
          },
          body: JSON.stringify({ email, code }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { code?: string; message?: string } }
            | null;
          throw new Error(body?.error?.code ?? `HTTP_${res.status}`);
        }
        setStatus('success');
        return { ok: true };
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'UNKNOWN_ERROR');
        return { ok: false };
      }
    },
    [base, opts.csrfToken],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { verify, status, error, reset };
}

export interface UseResendMagicLinkResult {
  resend: (email: string, type?: 'magic-link' | 'otp') => Promise<void>;
  status: Status;
  /** Error code, e.g. `MAGIC_LINK_RESEND_TOO_SOON`. */
  error: string | null;
  /** Seconds remaining in the cooldown window (populated on 429 responses). */
  retryAfterSeconds: number | null;
  reset: () => void;
}

export function useResendMagicLink(opts: UseMagicLinkOptions = {}): UseResendMagicLinkResult {
  const base = opts.basePath ?? '/api/auth';
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState<number | null>(null);

  const resend = useCallback(
    async (email: string, type?: 'magic-link' | 'otp') => {
      setStatus('loading');
      setError(null);
      setRetryAfterSeconds(null);
      try {
        const res = await fetch(`${base}/magic-link/resend`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            ...(opts.csrfToken ? { 'x-csrf-token': opts.csrfToken } : {}),
          },
          body: JSON.stringify({ email, ...(type ? { type } : {}) }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { code?: string; message?: string; retryAfterSeconds?: number } }
            | null;
          if (body?.error?.retryAfterSeconds != null) {
            setRetryAfterSeconds(body.error.retryAfterSeconds);
          }
          throw new Error(body?.error?.code ?? `HTTP_${res.status}`);
        }
        setStatus('success');
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'UNKNOWN_ERROR');
      }
    },
    [base, opts.csrfToken],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setRetryAfterSeconds(null);
  }, []);

  return { resend, status, error, retryAfterSeconds, reset };
}
