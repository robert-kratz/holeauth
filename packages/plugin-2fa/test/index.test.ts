/**
 * Integration-style tests for plugin-2fa's public API, routes, and hooks.
 *
 * We instantiate the real plugin with an in-memory TwoFactorAdapter and a
 * minimal but *real* PluginContext (real JWT signing via @holeauth/core
 * flows) so pending-token verification exercises the same code paths as
 * production.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import type {
  HoleauthConfig,
  IssuedTokens,
  SignInResult,
} from '@holeauth/core';
import type {
  PluginContext,
  PluginRouteContext,
} from '@holeauth/core/plugins';
import type { AdapterUser } from '@holeauth/core/adapters';
import { issuePendingToken } from '@holeauth/core/flows';
import { HoleauthError } from '@holeauth/core/errors';

import {
  twofa,
  type TwoFactorAdapter,
  type TwoFactorApi,
  type TwoFactorRecord,
  type TwoFactorRateLimiter,
} from '../src/index.js';

/* ─────────────────────────── helpers ─────────────────────────── */

function makeMemoryAdapter(): TwoFactorAdapter & { store: Map<string, TwoFactorRecord> } {
  const store = new Map<string, TwoFactorRecord>();
  return {
    store,
    async getByUserId(userId) {
      return store.get(userId) ?? null;
    },
    async upsert(record) {
      store.set(record.userId, { ...record });
      return { ...record };
    },
    async update(userId, patch) {
      const existing = store.get(userId);
      if (!existing) return null;
      const next = { ...existing, ...patch };
      store.set(userId, next);
      return next;
    },
    async delete(userId) {
      store.delete(userId);
    },
  };
}

interface Harness {
  api: TwoFactorApi;
  plugin: ReturnType<typeof twofa>;
  ctx: PluginContext;
  adapter: ReturnType<typeof makeMemoryAdapter>;
  user: AdapterUser;
  config: HoleauthConfig;
  completeSignIn: ReturnType<typeof vi.fn>;
  logger: { error: ReturnType<typeof vi.fn> } & Record<string, unknown>;
}

function makeHarness(options?: {
  user?: AdapterUser | null;
  rateLimiter?: TwoFactorRateLimiter;
}): Harness {
  const adapter = makeMemoryAdapter();
  const user: AdapterUser =
    options?.user === undefined
      ? ({
          id: 'user-1',
          email: 'alice@example.com',
          name: 'Alice',
          image: null,
          emailVerified: new Date(),
          passwordHash: null,
          createdAt: new Date(),
        } as unknown as AdapterUser)
      : (options.user as AdapterUser);

  const config = {
    secrets: { jwtSecret: 'test-secret-at-least-32-chars-long-xx' },
    adapters: {
      user: {} as unknown as HoleauthConfig['adapters']['user'],
      session: {} as unknown as HoleauthConfig['adapters']['session'],
      auditLog: {} as unknown as HoleauthConfig['adapters']['auditLog'],
    },
    tokens: { pendingTtl: 300, cookiePrefix: 'holeauth' },
  } as unknown as HoleauthConfig;

  const tokens: IssuedTokens = {
    accessToken: 'AT',
    refreshToken: 'RT',
    csrfToken: 'CSRF',
    sessionId: 'SID',
    accessTokenExpiresAt: Date.now() + 900_000,
    refreshTokenExpiresAt: Date.now() + 2_592_000_000,
  } as unknown as IssuedTokens;

  const completeSignIn = vi.fn(async (_userId: string) => ({ user, tokens }));

  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const ctx: PluginContext = {
    config,
    events: { on: () => () => {}, off: () => {}, emit: async () => {} },
    logger,
    core: {
      getUserById: vi.fn(async (_id: string) => (options?.user === null ? null : user)),
      getUserByEmail: vi.fn(async () => null),
      issueSession: vi.fn(async () => tokens),
      completeSignIn: completeSignIn as unknown as PluginContext['core']['completeSignIn'],
      revokeSession: vi.fn(async () => {}),
      issueSignInResult: vi.fn(
        async (): Promise<SignInResult> => ({ kind: 'ok', user, tokens }),
      ),
    },
    getPlugin: <T,>() => api as unknown as T,
    getPluginAdapter: <T,>() => adapter as unknown as T,
  };

  const plugin = twofa({ adapter, rateLimiter: options?.rateLimiter });
  const api = plugin.api(ctx);
  // rebind getPlugin to return the built api (already resolved)
  return { api, plugin, ctx, adapter, user, config, completeSignIn, logger };
}

function liveCode(secret: string): string {
  return new TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  }).generate();
}

/* ─────────────────────────── tests: api ─────────────────────────── */

describe('twofa.api — setup()', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('creates a disabled record with a base32 secret and returns a QR data URL', async () => {
    const out = await h.api.setup('user-1');
    expect(out.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(out.otpauthUrl).toContain('otpauth://totp/');
    expect(out.qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const stored = h.adapter.store.get('user-1');
    expect(stored?.enabled).toBe(false);
    expect(stored?.recoveryCodes).toEqual([]);
  });

  it('throws NOT_FOUND when the user does not exist', async () => {
    const h2 = makeHarness({ user: null });
    await expect(h2.api.setup('ghost')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('throws TWOFA_ALREADY_ENABLED when the user is already enrolled', async () => {
    await h.adapter.upsert({ userId: 'user-1', secret: 'S', enabled: true, recoveryCodes: [] });
    await expect(h.api.setup('user-1')).rejects.toMatchObject({ code: 'TWOFA_ALREADY_ENABLED' });
  });

  it('allows re-running setup when existing record is disabled (overwrites secret)', async () => {
    await h.adapter.upsert({ userId: 'user-1', secret: 'OLD', enabled: false, recoveryCodes: [] });
    const out = await h.api.setup('user-1');
    expect(h.adapter.store.get('user-1')?.secret).toBe(out.secret);
    expect(out.secret).not.toBe('OLD');
  });
});

describe('twofa.api — isEnabled()', () => {
  it('returns false when no record exists', async () => {
    const h = makeHarness();
    expect(await h.api.isEnabled('user-1')).toBe(false);
  });
  it('returns false for an unactivated (pending) record', async () => {
    const h = makeHarness();
    await h.adapter.upsert({ userId: 'user-1', secret: 'S', enabled: false, recoveryCodes: [] });
    expect(await h.api.isEnabled('user-1')).toBe(false);
  });
  it('returns true for an active record', async () => {
    const h = makeHarness();
    await h.adapter.upsert({ userId: 'user-1', secret: 'S', enabled: true, recoveryCodes: [] });
    expect(await h.api.isEnabled('user-1')).toBe(true);
  });
});

describe('twofa.api — activate()', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it('activates the record and returns fresh recovery codes', async () => {
    const { secret } = await h.api.setup('user-1');
    const out = await h.api.activate('user-1', liveCode(secret));
    expect(out.recoveryCodes).toHaveLength(10);
    expect(h.adapter.store.get('user-1')?.enabled).toBe(true);
  });

  it('respects recoveryCodeCount option', async () => {
    const adapter = makeMemoryAdapter();
    const plugin = twofa({ adapter, recoveryCodeCount: 3 });
    const h2 = makeHarness();
    const api = plugin.api(h2.ctx);
    await adapter.upsert({ userId: 'user-1', secret: 'JBSWY3DPEHPK3PXP', enabled: false, recoveryCodes: [] });
    const code = new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32('JBSWY3DPEHPK3PXP') }).generate();
    const out = await api.activate('user-1', code);
    expect(out.recoveryCodes).toHaveLength(3);
  });

  it('throws TWOFA_NOT_ENROLLED when no record exists', async () => {
    await expect(h.api.activate('nobody', '000000')).rejects.toMatchObject({ code: 'TWOFA_NOT_ENROLLED' });
  });

  it('throws TWOFA_ALREADY_ENABLED when called on an active record', async () => {
    await h.adapter.upsert({ userId: 'user-1', secret: 'JBSWY3DPEHPK3PXP', enabled: true, recoveryCodes: [] });
    await expect(h.api.activate('user-1', '000000')).rejects.toMatchObject({ code: 'TWOFA_ALREADY_ENABLED' });
  });

  it('throws INVALID_CREDENTIALS for a wrong code', async () => {
    await h.api.setup('user-1');
    await expect(h.api.activate('user-1', '000000')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('twofa.api — verify() with pending token', () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  async function enrolAndIssuePending(h: Harness): Promise<{ secret: string; pendingToken: string }> {
    const { secret } = await h.api.setup('user-1');
    await h.api.activate('user-1', liveCode(secret));
    const { token } = await issuePendingToken(h.config, { userId: 'user-1', pluginId: 'twofa' });
    return { secret, pendingToken: token };
  }

  it('accepts a valid TOTP code and returns tokens', async () => {
    const { secret, pendingToken } = await enrolAndIssuePending(h);
    const res = await h.api.verify({ pendingToken, code: liveCode(secret), ip: '1.2.3.4', userAgent: 'vitest' });
    expect(res.tokens.accessToken).toBe('AT');
    expect(h.completeSignIn).toHaveBeenCalledWith('user-1', expect.objectContaining({ method: 'totp', ip: '1.2.3.4', userAgent: 'vitest' }));
  });

  it('accepts a recovery code and consumes it', async () => {
    const { pendingToken } = await enrolAndIssuePending(h);
    const codes = h.adapter.store.get('user-1')!.recoveryCodes;
    const recovery = codes[0]!;
    await h.api.verify({ pendingToken, code: recovery });
    const remaining = h.adapter.store.get('user-1')!.recoveryCodes;
    expect(remaining).not.toContain(recovery);
    expect(remaining).toHaveLength(codes.length - 1);
  });

  it('accepts a recovery code supplied without dashes / mixed case', async () => {
    const { pendingToken } = await enrolAndIssuePending(h);
    const recovery = h.adapter.store.get('user-1')!.recoveryCodes[0]!;
    const mangled = recovery.replace(/-/g, '').toLowerCase();
    await expect(h.api.verify({ pendingToken, code: mangled })).resolves.toBeDefined();
  });

  it('rejects an invalid pending token with INVALID_CREDENTIALS', async () => {
    await expect(h.api.verify({ pendingToken: 'not-a-jwt', code: '000000' })).rejects.toThrow();
  });

  it('rejects a pending token issued for a different plugin id', async () => {
    const { token } = await issuePendingToken(h.config, { userId: 'user-1', pluginId: 'other' });
    await expect(h.api.verify({ pendingToken: token, code: '000000' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects when 2FA is disabled on the account', async () => {
    await h.adapter.upsert({ userId: 'user-1', secret: 'JBSWY3DPEHPK3PXP', enabled: false, recoveryCodes: [] });
    const { token } = await issuePendingToken(h.config, { userId: 'user-1', pluginId: 'twofa' });
    await expect(h.api.verify({ pendingToken: token, code: '000000' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('rejects when record does not exist (TWOFA_NOT_ENROLLED)', async () => {
    const { token } = await issuePendingToken(h.config, { userId: 'user-1', pluginId: 'twofa' });
    await expect(h.api.verify({ pendingToken: token, code: '000000' })).rejects.toMatchObject({ code: 'TWOFA_NOT_ENROLLED' });
  });

  it('rejects a wrong code with INVALID_CREDENTIALS', async () => {
    const { pendingToken } = await enrolAndIssuePending(h);
    await expect(h.api.verify({ pendingToken, code: '000000' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('twofa.api — disable()', () => {
  it('removes the record when the code is valid', async () => {
    const h = makeHarness();
    const { secret } = await h.api.setup('user-1');
    await h.api.activate('user-1', liveCode(secret));
    await h.api.disable('user-1', liveCode(secret));
    expect(h.adapter.store.get('user-1')).toBeUndefined();
  });
  it('rejects with TWOFA_NOT_ENROLLED when no record exists', async () => {
    const h = makeHarness();
    await expect(h.api.disable('nobody', '000000')).rejects.toMatchObject({ code: 'TWOFA_NOT_ENROLLED' });
  });
  it('rejects with INVALID_CREDENTIALS on a bad code (and keeps the record)', async () => {
    const h = makeHarness();
    const { secret } = await h.api.setup('user-1');
    await h.api.activate('user-1', liveCode(secret));
    await expect(h.api.disable('user-1', '000000')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(h.adapter.store.get('user-1')?.enabled).toBe(true);
  });
});

/* ─────────────────────────── tests: rate limiter wiring ─────────────────────────── */

describe('twofa.api — rate limiting', () => {
  it('activate() surfaces TWOFA_RATE_LIMITED when the limiter rejects', async () => {
    const limiter: TwoFactorRateLimiter = {
      check: vi.fn(async () => ({ ok: false, retryAfterSeconds: 30 })),
      reset: vi.fn(async () => {}),
    };
    const h = makeHarness({ rateLimiter: limiter });
    await h.api.setup('user-1');
    await expect(h.api.activate('user-1', '000000')).rejects.toMatchObject({
      code: 'TWOFA_RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 30,
    });
  });

  it('verify() calls limiter.reset on success', async () => {
    const limiter: TwoFactorRateLimiter = {
      check: vi.fn(async () => ({ ok: true })),
      reset: vi.fn(async () => {}),
    };
    const h = makeHarness({ rateLimiter: limiter });
    const { secret } = await h.api.setup('user-1');
    await h.api.activate('user-1', liveCode(secret));
    const { token } = await issuePendingToken(h.config, { userId: 'user-1', pluginId: 'twofa' });
    await h.api.verify({ pendingToken: token, code: liveCode(secret) });
    expect(limiter.reset).toHaveBeenCalledWith('verify:user-1');
  });

  it('disable() is gated by the limiter', async () => {
    const limiter: TwoFactorRateLimiter = {
      check: vi.fn(async () => ({ ok: false, retryAfterSeconds: 10 })),
      reset: vi.fn(async () => {}),
    };
    const h = makeHarness({ rateLimiter: limiter });
    await h.adapter.upsert({ userId: 'user-1', secret: 'JBSWY3DPEHPK3PXP', enabled: true, recoveryCodes: [] });
    await expect(h.api.disable('user-1', '000000')).rejects.toMatchObject({ code: 'TWOFA_RATE_LIMITED' });
    expect(limiter.check).toHaveBeenCalledWith('disable:user-1');
  });
});

/* ─────────────────────────── tests: qr helpers on API ─────────────────────────── */

describe('twofa.api — renderQr helpers', () => {
  it('renderQrDataUrl returns a data URL', async () => {
    const h = makeHarness();
    const url = await h.api.renderQrDataUrl('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
  });
  it('renderQrBuffer returns a Buffer', async () => {
    const h = makeHarness();
    const buf = await h.api.renderQrBuffer('hello');
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});

/* ─────────────────────────── tests: hooks ─────────────────────────── */

describe('twofa hooks', () => {
  it('signIn.challenge returns null when user has not enrolled', async () => {
    const h = makeHarness();
    const chal = await h.plugin.hooks!.signIn!.challenge!(h.user, {} as unknown as Parameters<NonNullable<NonNullable<typeof h.plugin.hooks>['signIn']>['challenge']>[1], h.ctx);
    expect(chal).toBeNull();
  });

  it('signIn.challenge returns null when 2FA is disabled', async () => {
    const h = makeHarness();
    await h.adapter.upsert({ userId: 'user-1', secret: 'S', enabled: false, recoveryCodes: [] });
    const chal = await h.plugin.hooks!.signIn!.challenge!(h.user, {} as unknown as Parameters<NonNullable<NonNullable<typeof h.plugin.hooks>['signIn']>['challenge']>[1], h.ctx);
    expect(chal).toBeNull();
  });

  it('signIn.challenge issues a pending JWT when enabled', async () => {
    const h = makeHarness();
    await h.adapter.upsert({ userId: 'user-1', secret: 'S', enabled: true, recoveryCodes: [] });
    const chal = await h.plugin.hooks!.signIn!.challenge!(h.user, {} as unknown as Parameters<NonNullable<NonNullable<typeof h.plugin.hooks>['signIn']>['challenge']>[1], h.ctx);
    expect(chal).not.toBeNull();
    expect(chal!.pluginId).toBe('twofa');
    expect(typeof chal!.pendingToken).toBe('string');
    expect(chal!.expiresAt).toBeGreaterThan(Date.now());
  });

  it('userDelete.after purges the record', async () => {
    const h = makeHarness();
    await h.adapter.upsert({ userId: 'user-1', secret: 'S', enabled: true, recoveryCodes: [] });
    await h.plugin.hooks!.userDelete!.after!({ userId: 'user-1' }, h.ctx);
    expect(h.adapter.store.get('user-1')).toBeUndefined();
  });

  it('userDelete.after logs adapter errors instead of swallowing them', async () => {
    const h = makeHarness();
    const original = h.adapter.delete;
    h.adapter.delete = vi.fn(async () => {
      throw new Error('db offline');
    });
    await h.plugin.hooks!.userDelete!.after!({ userId: 'user-1' }, h.ctx);
    expect(h.logger.error).toHaveBeenCalledWith(
      expect.stringContaining('twofa'),
      expect.any(Error),
    );
    h.adapter.delete = original;
  });
});

/* ─────────────────────────── tests: routes ─────────────────────────── */

function makeRctx(overrides: Partial<PluginRouteContext> & { api: TwoFactorApi; config: HoleauthConfig; body?: Record<string, unknown>; session?: { userId: string; sessionId: string; expiresAt: number } | null; cookie?: string | undefined }) {
  const cookies: Record<string, string> = {};
  if (overrides.cookie) cookies['holeauth.pending'] = overrides.cookie;
  const setCookies: Array<{ name: string; value: string }> = [];
  const rctx: PluginRouteContext & { _setCookies: typeof setCookies } = {
    req: new Request('http://localhost/api/auth/2fa'),
    body: overrides.body ?? {},
    responseHeaders: new Headers(),
    cookies: { get: (n) => cookies[n] },
    setCookie: (s) => {
      setCookies.push({ name: s.name, value: s.value });
    },
    getSession: async () => (overrides.session === undefined ? { userId: 'user-1', sessionId: 'SID', expiresAt: Date.now() + 60_000 } : overrides.session),
    meta: { ip: '127.0.0.1', userAgent: 'vitest' },
    plugin: {
      config: overrides.config,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      events: { on: () => () => {}, off: () => {}, emit: async () => {} },
      core: {} as unknown as PluginContext['core'],
      getPlugin: <T,>() => overrides.api as unknown as T,
      getPluginAdapter: () => undefined,
    } as unknown as PluginContext,
    _setCookies: setCookies,
  };
  return rctx;
}

function routeByPath(plugin: ReturnType<typeof twofa>, path: string) {
  const r = plugin.routes!.find((x) => x.path === path);
  if (!r) throw new Error(`route ${path} not found`);
  return r;
}

describe('twofa routes', () => {
  it('POST /2fa/setup — returns 401 without session', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config, session: null });
    const res = await routeByPath(h.plugin, '/2fa/setup').handler!(rctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('POST /2fa/setup — returns 200 + payload on success', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config });
    const res = await routeByPath(h.plugin, '/2fa/setup').handler!(rctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.secret).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('POST /2fa/activate — 401 without session', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config, session: null });
    const res = await routeByPath(h.plugin, '/2fa/activate').handler!(rctx);
    expect(res.status).toBe(401);
  });

  it('POST /2fa/activate — 400 when code is missing / not a string', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config, body: { code: 12345 } });
    await expect(routeByPath(h.plugin, '/2fa/activate').handler!(rctx)).rejects.toMatchObject({
      code: 'TWOFA_INVALID_INPUT',
    });
  });

  it('POST /2fa/activate — 400 when code exceeds max length', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config, body: { code: 'x'.repeat(1000) } });
    await expect(routeByPath(h.plugin, '/2fa/activate').handler!(rctx)).rejects.toMatchObject({
      code: 'TWOFA_INVALID_INPUT',
    });
  });

  it('POST /2fa/activate — 200 with recovery codes on success', async () => {
    const h = makeHarness();
    const { secret } = await h.api.setup('user-1');
    const rctx = makeRctx({ api: h.api, config: h.config, body: { code: liveCode(secret) } });
    const res = await routeByPath(h.plugin, '/2fa/activate').handler!(rctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.recoveryCodes).toHaveLength(10);
  });

  it('POST /2fa/verify — 400 when no pending cookie', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config, session: null, body: { code: '000000' } });
    const res = await routeByPath(h.plugin, '/2fa/verify').handler!(rctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'NO_PENDING' } });
  });

  it('POST /2fa/verify — happy path sets 4 cookies and returns user', async () => {
    const h = makeHarness();
    const { secret } = await h.api.setup('user-1');
    await h.api.activate('user-1', liveCode(secret));
    const { token } = await issuePendingToken(h.config, { userId: 'user-1', pluginId: 'twofa' });
    const rctx = makeRctx({ api: h.api, config: h.config, session: null, cookie: token, body: { code: liveCode(secret) } });
    const res = await routeByPath(h.plugin, '/2fa/verify').handler!(rctx);
    expect(res.status).toBe(200);
    const names = (rctx as unknown as { _setCookies: Array<{ name: string }> })._setCookies.map((c) => c.name);
    expect(names).toEqual(['holeauth.at', 'holeauth.rt', 'holeauth.csrf', 'holeauth.pending']);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user.id).toBe('user-1');
    expect(body.csrfToken).toBe('CSRF');
  });

  it('POST /2fa/disable — 401 without session', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config, session: null, body: { code: '000000' } });
    const res = await routeByPath(h.plugin, '/2fa/disable').handler!(rctx);
    expect(res.status).toBe(401);
  });

  it('POST /2fa/disable — 200 with valid code', async () => {
    const h = makeHarness();
    const { secret } = await h.api.setup('user-1');
    await h.api.activate('user-1', liveCode(secret));
    const rctx = makeRctx({ api: h.api, config: h.config, body: { code: liveCode(secret) } });
    const res = await routeByPath(h.plugin, '/2fa/disable').handler!(rctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

/* ─────────────────────────── tests: utility errors ─────────────────────────── */

describe('twoFactorRateLimitedError export', () => {
  it('returns a HoleauthError with 429 + retryAfter', async () => {
    const { twoFactorRateLimitedError } = await import('../src/index.js');
    const err = twoFactorRateLimitedError(42);
    expect(err).toBeInstanceOf(HoleauthError);
    expect(err.status).toBe(429);
    expect((err as unknown as { retryAfterSeconds?: number }).retryAfterSeconds).toBe(42);
  });
  it('omits retryAfterSeconds when not provided', async () => {
    const { twoFactorRateLimitedError } = await import('../src/index.js');
    const err = twoFactorRateLimitedError();
    expect((err as unknown as { retryAfterSeconds?: number }).retryAfterSeconds).toBeUndefined();
  });
});
