'use client';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { holeauthFetch } from './fetch.js';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export interface ClientSession {
  userId: string;
  sessionId: string;
  expiresAt: number;
  [key: string]: unknown;
}

export interface RbacSnapshot {
  groups: string[];
  permissions: string[];
}

interface InternalCtx {
  session: ClientSession | null;
  loading: boolean;
  basePath: string;
  cookiePrefix: string;
  refresh: () => Promise<void>;
  setSession: (s: ClientSession | null) => void;
  rbac: RbacSnapshot | null;
  setRbac: (r: RbacSnapshot | null) => void;
  fetchRbac: () => Promise<RbacSnapshot | null>;
}

const Ctx = createContext<InternalCtx | null>(null);

function useInternal(): InternalCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('holeauth hooks require <HoleauthProvider>');
  return c;
}

// ─────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────

export interface HoleauthProviderProps {
  children: ReactNode;
  /** Base URL for the auth handler. Default `/api/auth`. */
  basePath?: string;
  /** Cookie prefix used server-side (for CSRF). Default `holeauth`. */
  cookiePrefix?: string;
}

export function HoleauthProvider({
  children,
  basePath = '/api/auth',
  cookiePrefix = 'holeauth',
}: HoleauthProviderProps) {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [rbac, setRbac] = useState<RbacSnapshot | null>(null);
  const rbacInFlight = useRef<Promise<RbacSnapshot | null> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await holeauthFetch(`${basePath}/session`, { cookiePrefix });
      if (res.ok) {
        const body = (await res.json()) as ClientSession | null;
        setSession(body);
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [basePath, cookiePrefix]);

  const fetchRbac = useCallback(async (): Promise<RbacSnapshot | null> => {
    if (rbacInFlight.current) return rbacInFlight.current;
    const p = (async () => {
      try {
        const res = await holeauthFetch(`${basePath}/rbac/me`, { cookiePrefix });
        if (!res.ok) return null;
        const body = (await res.json()) as RbacSnapshot;
        setRbac(body);
        return body;
      } catch {
        return null;
      } finally {
        rbacInFlight.current = null;
      }
    })();
    rbacInFlight.current = p;
    return p;
  }, [basePath, cookiePrefix]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!session) setRbac(null);
  }, [session]);

  const value = useMemo<InternalCtx>(
    () => ({
      session,
      loading,
      basePath,
      cookiePrefix,
      refresh,
      setSession,
      rbac,
      setRbac,
      fetchRbac,
    }),
    [session, loading, basePath, cookiePrefix, refresh, rbac, fetchRbac],
  );

  return createElement(Ctx.Provider, { value }, children);
}

// ─────────────────────────────────────────────────────────────────────────
// Core hooks
// ─────────────────────────────────────────────────────────────────────────

export function useSession(): ClientSession | null {
  return useInternal().session;
}

export interface UseAuth {
  session: ClientSession | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const { session, loading, refresh } = useInternal();
  return { session, loading, refresh };
}

export function useCsrf(): string | null {
  const { cookiePrefix } = useInternal();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const read = () => {
      const prefix = `${cookiePrefix}.csrf=`;
      for (const c of document.cookie.split('; ')) {
        if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length));
      }
      return null;
    };
    setToken(read());
  }, [cookiePrefix]);
  return token;
}

// ─────────────────────────────────────────────────────────────────────────
// Auth actions
// ─────────────────────────────────────────────────────────────────────────

type ErrorState = { message: string; code?: string } | null;

function useMutationState() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorState>(null);
  return { loading, setLoading, error, setError };
}

async function parseErr(res: Response): Promise<ErrorState> {
  try {
    const body = (await res.json()) as
      | { error?: string | { code?: string; message?: string }; code?: string; message?: string };
    if (body && typeof body.error === 'object' && body.error) {
      return { message: body.error.message ?? res.statusText, code: body.error.code };
    }
    return {
      message: (typeof body.error === 'string' ? body.error : body.message) ?? res.statusText,
      code: body.code,
    };
  } catch {
    return { message: res.statusText };
  }
}

export function useSignIn() {
  const { basePath, cookiePrefix, refresh, setSession } = useInternal();
  const [pending, setPending] = useState<null | { token: string; type: string }>(null);
  const { loading, setLoading, error, setError } = useMutationState();

  const signIn = useCallback(
    async (input: { email: string; password: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/signin`, {
          method: 'POST',
          body: JSON.stringify(input),
          cookiePrefix,
        });
        if (!res.ok) {
          const e = await parseErr(res);
          setError(e);
          return { ok: false as const, error: e };
        }
        const body = (await res.json()) as
          | ClientSession
          | { pendingToken: string; pendingType: string };
        if ('pendingToken' in body && typeof body.pendingToken === 'string') {
          const pendingToken = body.pendingToken;
          const pendingType =
            'pendingType' in body && typeof body.pendingType === 'string' ? body.pendingType : '';
          setPending({ token: pendingToken, type: pendingType });
          return { ok: true as const, pending: { token: pendingToken, type: pendingType } };
        }
        setSession(body as ClientSession);
        await refresh();
        return { ok: true as const, session: body as ClientSession };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, refresh, setSession, setLoading, setError],
  );

  return { signIn, loading, error, pending };
}

export function useSignUp() {
  const { basePath, cookiePrefix, refresh } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();

  const signUp = useCallback(
    async (input: { email: string; password: string; name?: string; autoSignIn?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/register`, {
          method: 'POST',
          body: JSON.stringify(input),
          cookiePrefix,
        });
        if (!res.ok) {
          const e = await parseErr(res);
          setError(e);
          return { ok: false as const, error: e };
        }
        if (input.autoSignIn !== false) {
          await holeauthFetch(`${basePath}/signin`, {
            method: 'POST',
            body: JSON.stringify({ email: input.email, password: input.password }),
            cookiePrefix,
          });
          await refresh();
        }
        return { ok: true as const };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, refresh, setLoading, setError],
  );

  return { signUp, loading, error };
}

export function useSignOut() {
  const { basePath, cookiePrefix, setSession, setRbac } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();

  const signOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await holeauthFetch(`${basePath}/signout`, { method: 'POST', cookiePrefix });
      if (!res.ok) {
        const e = await parseErr(res);
        setError(e);
        return { ok: false as const };
      }
      setSession(null);
      setRbac(null);
      return { ok: true as const };
    } finally {
      setLoading(false);
    }
  }, [basePath, cookiePrefix, setSession, setRbac, setLoading, setError]);

  return { signOut, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────
// Invites
// ─────────────────────────────────────────────────────────────────────────

export interface InviteResult {
  token: string;
  url?: string;
  identifier: string;
  expiresAt: number;
}

export interface InviteInfo {
  email: string;
  name: string | null;
  expiresAt: number;
  identifier: string;
}

export interface InviteListItem {
  identifier: string;
  email: string;
  expiresAt: number;
}

export function useCreateInvite() {
  const { basePath, cookiePrefix } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();
  const [result, setResult] = useState<InviteResult | null>(null);

  const createInvite = useCallback(
    async (input: {
      email: string;
      name?: string;
      groupIds?: string[];
      metadata?: Record<string, unknown>;
      ttlSeconds?: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/invite/create`, {
          method: 'POST',
          body: JSON.stringify(input),
          cookiePrefix,
        });
        if (!res.ok) {
          const e = await parseErr(res);
          setError(e);
          return { ok: false as const, error: e };
        }
        const body = (await res.json()) as { invite: InviteResult };
        setResult(body.invite);
        return { ok: true as const, invite: body.invite };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, setLoading, setError],
  );

  return { createInvite, loading, error, result, reset: () => setResult(null) };
}

export function useConsumeInvite() {
  const { basePath, cookiePrefix, refresh } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();

  const consume = useCallback(
    async (input: { token: string; password: string; name?: string; autoSignIn?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/invite/consume`, {
          method: 'POST',
          body: JSON.stringify(input),
          cookiePrefix,
        });
        if (!res.ok) {
          const e = await parseErr(res);
          setError(e);
          return { ok: false as const, error: e };
        }
        const body = (await res.json()) as {
          user: { id: string; email: string; name: string | null };
          groupIds?: string[];
        };
        if (input.autoSignIn !== false) await refresh();
        return { ok: true as const, user: body.user, groupIds: body.groupIds ?? [] };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, refresh, setLoading, setError],
  );

  return { consume, loading, error };
}

export function useInviteInfo(token: string | null | undefined) {
  const { basePath, cookiePrefix } = useInternal();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(!!token);
  const [error, setError] = useState<ErrorState>(null);

  useEffect(() => {
    if (!token) { setInfo(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await holeauthFetch(
          `${basePath}/invite/info?token=${encodeURIComponent(token)}`,
          { cookiePrefix },
        );
        if (cancelled) return;
        if (!res.ok) {
          setError(await parseErr(res));
          setInfo(null);
        } else {
          const body = (await res.json()) as { invite: InviteInfo };
          setInfo(body.invite);
        }
      } catch (e) {
        if (!cancelled) setError({ message: (e as Error).message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, basePath, cookiePrefix]);

  return { info, loading, error };
}

export function useListInvites() {
  const { basePath, cookiePrefix } = useInternal();
  const [invites, setInvites] = useState<InviteListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorState>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await holeauthFetch(`${basePath}/invite/list`, { cookiePrefix });
      if (!res.ok) { setError(await parseErr(res)); return; }
      const body = (await res.json()) as { invites: InviteListItem[] };
      setInvites(body.invites);
    } finally {
      setLoading(false);
    }
  }, [basePath, cookiePrefix]);

  return { invites, loading, error, reload };
}

export function useRevokeInvite() {
  const { basePath, cookiePrefix } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();

  const revoke = useCallback(
    async (identifier: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/invite/revoke`, {
          method: 'POST',
          body: JSON.stringify({ identifier }),
          cookiePrefix,
        });
        if (!res.ok) {
          const e = await parseErr(res);
          setError(e);
          return { ok: false as const, error: e };
        }
        return { ok: true as const };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, setLoading, setError],
  );

  return { revoke, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────
// Password flows
// ─────────────────────────────────────────────────────────────────────────

export function usePasswordReset() {
  const { basePath, cookiePrefix } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();

  const request = useCallback(
    async (email: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/password/forgot`, {
          method: 'POST',
          body: JSON.stringify({ email }),
          cookiePrefix,
        });
        if (!res.ok) {
          setError(await parseErr(res));
          return { ok: false as const };
        }
        return { ok: true as const };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, setLoading, setError],
  );

  const consume = useCallback(
    async (input: { email: string; token: string; newPassword: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/password/reset`, {
          method: 'POST',
          body: JSON.stringify(input),
          cookiePrefix,
        });
        if (!res.ok) {
          setError(await parseErr(res));
          return { ok: false as const };
        }
        return { ok: true as const };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, setLoading, setError],
  );

  return { request, consume, loading, error };
}

export function usePasswordChange() {
  const { basePath, cookiePrefix } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();
  const change = useCallback(
    async (input: { currentPassword: string; newPassword: string; revokeOtherSessions?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/password/change`, {
          method: 'POST',
          body: JSON.stringify(input),
          cookiePrefix,
        });
        if (!res.ok) {
          setError(await parseErr(res));
          return { ok: false as const };
        }
        return { ok: true as const };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, setLoading, setError],
  );
  return { change, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────
// 2FA
// ─────────────────────────────────────────────────────────────────────────

export interface TwoFaSetupResult {
  qrUrl: string;
  secret: string;
  recoveryCodes: string[];
}

export function use2faSetup() {
  const { basePath, cookiePrefix, refresh } = useInternal();
  const [data, setData] = useState<TwoFaSetupResult | null>(null);
  const { loading, setLoading, error, setError } = useMutationState();

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await holeauthFetch(`${basePath}/2fa/setup`, { method: 'POST', cookiePrefix });
      if (!res.ok) {
        setError(await parseErr(res));
        return null;
      }
      const body = (await res.json()) as TwoFaSetupResult;
      setData(body);
      return body;
    } finally {
      setLoading(false);
    }
  }, [basePath, cookiePrefix, setLoading, setError]);

  const activate = useCallback(
    async (code: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/2fa/activate`, {
          method: 'POST',
          body: JSON.stringify({ code }),
          cookiePrefix,
        });
        if (!res.ok) {
          setError(await parseErr(res));
          return { ok: false as const };
        }
        await refresh();
        return { ok: true as const };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, refresh, setLoading, setError],
  );

  return { start, activate, data, loading, error };
}

export function use2faVerify() {
  const { basePath, cookiePrefix, refresh } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();
  const verify = useCallback(
    async (input: { pendingToken: string; code: string }) => {
      setLoading(true);
      setError(null);
      try {
        const res = await holeauthFetch(`${basePath}/2fa/verify`, {
          method: 'POST',
          body: JSON.stringify(input),
          cookiePrefix,
        });
        if (!res.ok) {
          setError(await parseErr(res));
          return { ok: false as const };
        }
        await refresh();
        return { ok: true as const };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, refresh, setLoading, setError],
  );
  return { verify, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────
// Passkey (WebAuthn) — uses @simplewebauthn/browser (shipped as a
// regular dependency of @holeauth/react). Loaded via a dynamic import so
// bundlers can split it into its own chunk and consumers that don't use
// passkey hooks pay no upfront cost.
// ─────────────────────────────────────────────────────────────────────────

type WebauthnBrowser = {
  startRegistration: (opts: { optionsJSON: unknown }) => Promise<unknown>;
  startAuthentication: (opts: { optionsJSON: unknown }) => Promise<unknown>;
};

async function loadWebauthn(): Promise<WebauthnBrowser> {
  try {
    const mod = (await import('@simplewebauthn/browser')) as unknown as WebauthnBrowser;
    return mod;
  } catch {
    throw new Error(
      '@simplewebauthn/browser failed to load. Ensure @holeauth/react is installed correctly.',
    );
  }
}

export function usePasskeyRegister() {
  const { basePath, cookiePrefix, refresh } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();
  const register = useCallback(
    async (deviceName?: string) => {
      setLoading(true);
      setError(null);
      try {
        const optsRes = await holeauthFetch(`${basePath}/passkey/register/options`, {
          method: 'POST',
          cookiePrefix,
        });
        if (!optsRes.ok) {
          setError(await parseErr(optsRes));
          return { ok: false as const };
        }
        const { options } = (await optsRes.json()) as { options: unknown };
        const webauthn = await loadWebauthn();
        const att = await webauthn.startRegistration({ optionsJSON: options });
        const verifyRes = await holeauthFetch(`${basePath}/passkey/register/verify`, {
          method: 'POST',
          body: JSON.stringify({ response: att, deviceName }),
          cookiePrefix,
        });
        if (!verifyRes.ok) {
          setError(await parseErr(verifyRes));
          return { ok: false as const };
        }
        await refresh();
        return { ok: true as const };
      } catch (err) {
        setError({ message: err instanceof Error ? err.message : 'passkey register failed' });
        return { ok: false as const };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, refresh, setLoading, setError],
  );
  return { register, loading, error };
}

export function usePasskeyLogin() {
  const { basePath, cookiePrefix, refresh } = useInternal();
  const { loading, setLoading, error, setError } = useMutationState();
  const login = useCallback(
    async (email?: string) => {
      setLoading(true);
      setError(null);
      try {
        const optsRes = await holeauthFetch(`${basePath}/passkey/login/options`, {
          method: 'POST',
          body: email ? JSON.stringify({ email }) : undefined,
          cookiePrefix,
        });
        if (!optsRes.ok) {
          setError(await parseErr(optsRes));
          return { ok: false as const };
        }
        const { options } = (await optsRes.json()) as { options: unknown };
        const webauthn = await loadWebauthn();
        const assertion = await webauthn.startAuthentication({ optionsJSON: options });
        const verifyRes = await holeauthFetch(`${basePath}/passkey/login/verify`, {
          method: 'POST',
          body: JSON.stringify({ response: assertion }),
          cookiePrefix,
        });
        if (!verifyRes.ok) {
          setError(await parseErr(verifyRes));
          return { ok: false as const };
        }
        await refresh();
        return { ok: true as const };
      } catch (err) {
        setError({ message: err instanceof Error ? err.message : 'passkey login failed' });
        return { ok: false as const };
      } finally {
        setLoading(false);
      }
    },
    [basePath, cookiePrefix, refresh, setLoading, setError],
  );
  return { login, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────
// SSO
// ─────────────────────────────────────────────────────────────────────────

export function useSso(providerId: string) {
  const { basePath } = useInternal();
  const start = useCallback(
    (redirectAfter?: string) => {
      const url = new URL(`${basePath}/authorize/${providerId}`, window.location.origin);
      if (redirectAfter) url.searchParams.set('redirectTo', redirectAfter);
      window.location.href = url.toString();
    },
    [basePath, providerId],
  );
  return { start };
}

// ─────────────────────────────────────────────────────────────────────────
// RBAC
// ─────────────────────────────────────────────────────────────────────────

export function usePermission(node: string | string[]): { allowed: boolean; loading: boolean } {
  const { rbac, fetchRbac, session } = useInternal();
  const [loading, setLoading] = useState(rbac === null && session !== null);

  useEffect(() => {
    if (!session) return;
    if (rbac) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchRbac().finally(() => setLoading(false));
  }, [session, rbac, fetchRbac]);

  const nodes = useMemo(() => (Array.isArray(node) ? node : [node]), [node]);
  const allowed = useMemo(() => {
    if (!rbac) return false;
    return nodes.every((n) => checkNode(n, rbac.permissions));
  }, [rbac, nodes]);

  return { allowed, loading };
}

export function useGroups(): { groups: string[]; loading: boolean } {
  const { rbac, fetchRbac, session } = useInternal();
  const [loading, setLoading] = useState(rbac === null && session !== null);
  useEffect(() => {
    if (!session) return;
    if (rbac) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchRbac().finally(() => setLoading(false));
  }, [session, rbac, fetchRbac]);
  return { groups: rbac?.groups ?? [], loading };
}

function checkNode(required: string, effective: string[]): boolean {
  let allowed = false;
  for (const node of effective) {
    if (node.startsWith('!')) {
      if (matchPattern(node.slice(1), required)) return false;
    } else if (matchPattern(node, required)) {
      allowed = true;
    }
  }
  return allowed;
}
function matchPattern(pattern: string, node: string): boolean {
  if (pattern === '*' || pattern === node) return true;
  const pp = pattern.split('.');
  const nn = node.split('.');
  for (let i = 0; i < pp.length; i++) {
    const p = pp[i];
    if (p === '*') return i === pp.length - 1 || i < nn.length;
    if (nn[i] !== p) return false;
  }
  return pp.length === nn.length;
}

// ─────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id?: string;
  type: string;
  userId?: string | null;
  at?: string;
  ip?: string | null;
  data?: Record<string, unknown> | null;
}

export function useAuditLog(opts: { limit?: number } = {}) {
  const { basePath, cookiePrefix, session } = useInternal();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const { loading, setLoading, error, setError } = useMutationState();

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${basePath}/audit`, window.location.origin);
      if (opts.limit) url.searchParams.set('limit', String(opts.limit));
      const res = await holeauthFetch(url.toString(), { cookiePrefix });
      if (!res.ok) {
        setError(await parseErr(res));
        return;
      }
      setEntries(((await res.json()) as { entries?: AuditEntry[] }).entries ?? []);
    } finally {
      setLoading(false);
    }
  }, [basePath, cookiePrefix, session, opts.limit, setLoading, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  return { entries, loading, error, reload: load };
}

// ─────────────────────────────────────────────────────────────────────────
// Authenticated context — server-validated session bridge
//
// Lets a Server Component pass the result of `validateCurrentRequest` /
// `getFullSession` (from `@holeauth/nextjs`) into the client tree, so that
// downstream client components can consume the *validated* session, user and
// (optionally) RBAC snapshot synchronously via a hook — without re-fetching.
// ─────────────────────────────────────────────────────────────────────────

/** Minimal shape compatible with `ValidatedRequest` from `@holeauth/nextjs`. */
export interface AuthenticatedSnapshot<TUser = unknown> {
  session: {
    userId: string;
    sessionId: string;
    expiresAt: number;
    [key: string]: unknown;
  };
  user?: TUser;
  permissions?: string[];
  groups?: string[];
}

const AuthenticatedCtx = createContext<AuthenticatedSnapshot | null | undefined>(undefined);

export interface AuthenticatedProviderProps {
  /**
   * Result of `validateCurrentRequest(auth, …)` (or `getFullSession`).
   * Pass `null` for unauthenticated visitors so consumers can render a
   * signed-out UI without throwing.
   */
  value: AuthenticatedSnapshot | null;
  children: ReactNode;
}

/**
 * Client-side provider fed by a Server Component with the result of
 * `validateCurrentRequest` / `getFullSession`. Pair with `useAuthenticated`
 * (throws when not signed in) or `useOptionalAuthenticated` (nullable).
 */
export function AuthenticatedProvider({ value, children }: AuthenticatedProviderProps) {
  return createElement(AuthenticatedCtx.Provider, { value }, children);
}

/**
 * Returns the server-validated session bundle. Throws when no
 * `<AuthenticatedProvider>` ancestor exists or when the visitor is not
 * authenticated. Use inside Suspense children of an authenticated route.
 */
export function useAuthenticated<TUser = unknown>(): AuthenticatedSnapshot<TUser> {
  const v = useContext(AuthenticatedCtx);
  if (v === undefined) {
    throw new Error('useAuthenticated requires <AuthenticatedProvider>');
  }
  if (v === null) {
    throw new Error('useAuthenticated called without an authenticated session');
  }
  return v as AuthenticatedSnapshot<TUser>;
}

/**
 * Returns the server-validated session bundle, or `null` for guests.
 * Throws only when no `<AuthenticatedProvider>` ancestor exists.
 */
export function useOptionalAuthenticated<TUser = unknown>(): AuthenticatedSnapshot<TUser> | null {
  const v = useContext(AuthenticatedCtx);
  if (v === undefined) {
    throw new Error('useOptionalAuthenticated requires <AuthenticatedProvider>');
  }
  return v as AuthenticatedSnapshot<TUser> | null;
}

// ─────────────────────────────────────────────────────────────────────────
export { holeauthFetch } from './fetch.js';
export type { HoleauthFetchOptions } from './fetch.js';
