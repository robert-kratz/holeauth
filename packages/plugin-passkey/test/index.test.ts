/**
 * Integration-style tests for plugin-passkey's public API, routes, and hooks.
 *
 * WebAuthn ceremony verification is stubbed via vi.mock so we can exercise
 * every branch of the plugin (success, failure, counter regression, etc.)
 * without generating real authenticator assertions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

/* ────────────────── mock @simplewebauthn/server ────────────────── */

const generateRegistrationOptions = vi.fn(async (_args: unknown) => ({
  challenge: 'reg-challenge',
  user: { id: 'uid' },
  pubKeyCredParams: [],
}));
const verifyRegistrationResponse = vi.fn(async (_args: unknown) => ({
  verified: true,
  registrationInfo: {
    credential: {
      id: 'cred-1',
      publicKey: new Uint8Array([1, 2, 3, 4]),
      counter: 0,
    },
  },
}));
const generateAuthenticationOptions = vi.fn(async (args: { allowCredentials?: unknown }) => ({
  challenge: 'login-challenge',
  allowCredentials: args.allowCredentials,
}));
const verifyAuthenticationResponse = vi.fn(async (_args: unknown) => ({
  verified: true,
  authenticationInfo: { newCounter: 1 },
}));

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
}));

/* ────────────────── imports AFTER mock ────────────────── */

const {
  passkey,
  createMemoryRateLimiter,
  passkeyRateLimitedError,
} = await import('../src/index.js');
type PasskeyApi = import('../src/index.js').PasskeyApi;
type PasskeyAdapter = import('../src/index.js').PasskeyAdapter;
type PasskeyRecord = import('../src/index.js').PasskeyRecord;
type PasskeyRateLimiter = import('../src/index.js').PasskeyRateLimiter;

/* ────────────────── in-memory adapter ────────────────── */

function makeAdapter(): PasskeyAdapter & { store: Map<string, PasskeyRecord> } {
  const store = new Map<string, PasskeyRecord>();
  let seq = 0;
  return {
    store,
    async list(userId) {
      return [...store.values()].filter((r) => r.userId === userId);
    },
    async getByCredentialId(credentialId) {
      return [...store.values()].find((r) => r.credentialId === credentialId) ?? null;
    },
    async create(data) {
      const rec = { id: `pk-${++seq}`, ...data } as PasskeyRecord;
      store.set(rec.id, rec);
      return rec;
    },
    async updateCounter(credentialId, counter) {
      for (const r of store.values()) if (r.credentialId === credentialId) r.counter = counter;
    },
    async delete(id) {
      store.delete(id);
    },
  };
}

/* ────────────────── harness ────────────────── */

interface Harness {
  api: PasskeyApi;
  plugin: ReturnType<typeof passkey>;
  ctx: PluginContext;
  adapter: ReturnType<typeof makeAdapter>;
  user: AdapterUser;
  config: HoleauthConfig;
  completeSignIn: ReturnType<typeof vi.fn>;
  logger: { error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
}

function makeHarness(options?: {
  user?: AdapterUser | null;
  rateLimiter?: PasskeyRateLimiter;
}): Harness {
  const adapter = makeAdapter();
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
      user: {
        getUserById: vi.fn(async (_id: string) => (options?.user === null ? null : user)),
      } as unknown as HoleauthConfig['adapters']['user'],
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
      getUserById: vi.fn(async () => user),
      getUserByEmail: vi.fn(async () => null),
      issueSession: vi.fn(async () => tokens),
      completeSignIn: completeSignIn as unknown as PluginContext['core']['completeSignIn'],
      revokeSession: vi.fn(async () => {}),
      issueSignInResult: vi.fn(
        async (): Promise<SignInResult> => ({ kind: 'ok', user, tokens }),
      ),
    } as unknown as PluginContext['core'],
    getPlugin: <T,>() => api as unknown as T,
    getPluginAdapter: <T,>() => adapter as unknown as T,
  };

  const plugin = passkey({
    adapter,
    rpID: 'app.example.com',
    rpOrigin: 'https://app.example.com',
    rpName: 'Test',
    rateLimiter: options?.rateLimiter,
  });
  const api = plugin.api(ctx);
  return { api, plugin, ctx, adapter, user, config, completeSignIn, logger };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateRegistrationOptions.mockResolvedValue({
    challenge: 'reg-challenge',
    user: { id: 'uid' },
    pubKeyCredParams: [],
  });
  verifyRegistrationResponse.mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: 'cred-1',
        publicKey: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
      },
    },
  });
  generateAuthenticationOptions.mockImplementation(async (args: { allowCredentials?: unknown }) => ({
    challenge: 'login-challenge',
    allowCredentials: args.allowCredentials,
  }));
  verifyAuthenticationResponse.mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 1 },
  });
});

/* ────────────────── error helper ────────────────── */

describe('passkeyRateLimitedError', () => {
  it('returns a 429 HoleauthError with retryAfterSeconds', () => {
    const err = passkeyRateLimitedError(42);
    expect(err.status).toBe(429);
    expect(err.code).toBe('PASSKEY_RATE_LIMITED');
    expect((err as unknown as { retryAfterSeconds: number }).retryAfterSeconds).toBe(42);
  });
  it('omits retryAfterSeconds when not given', () => {
    const err = passkeyRateLimitedError();
    expect('retryAfterSeconds' in (err as object)).toBe(false);
  });
});

/* ────────────────── registerOptions ────────────────── */

describe('passkey.api — registerOptions', () => {
  it('returns options + challenge for a known user', async () => {
    const h = makeHarness();
    const out = await h.api.registerOptions('user-1');
    expect(out.challenge).toBe('reg-challenge');
    expect(generateRegistrationOptions).toHaveBeenCalledOnce();
  });

  it('throws NOT_FOUND for an unknown user', async () => {
    const h = makeHarness({ user: null });
    await expect(h.api.registerOptions('ghost')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('excludes existing credentials from the options', async () => {
    const h = makeHarness();
    await h.adapter.create({
      userId: 'user-1', credentialId: 'existing', publicKey: 'pk', counter: 0,
      transports: null, deviceName: null,
    });
    await h.api.registerOptions('user-1');
    const args = generateRegistrationOptions.mock.calls[0]![0] as { excludeCredentials: { id: string }[] };
    expect(args.excludeCredentials).toEqual([{ id: 'existing', transports: undefined }]);
  });

  it('rejects an empty/non-string userId', async () => {
    const h = makeHarness();
    await expect(h.api.registerOptions('')).rejects.toMatchObject({ code: 'PASSKEY_INVALID_INPUT' });
    await expect(h.api.registerOptions(123 as unknown as string)).rejects.toMatchObject({ code: 'PASSKEY_INVALID_INPUT' });
  });

  it('rejects an over-long userId', async () => {
    const h = makeHarness();
    await expect(h.api.registerOptions('x'.repeat(600))).rejects.toMatchObject({
      code: 'PASSKEY_INVALID_INPUT',
    });
  });
});

/* ────────────────── registerVerify ────────────────── */

describe('passkey.api — registerVerify', () => {
  it('stores the credential on verified response', async () => {
    const h = makeHarness();
    const out = await h.api.registerVerify('user-1', {
      response: { id: 'cred-1' },
      expectedChallenge: 'reg-challenge',
      deviceName: 'MacBook',
    });
    expect(out.credentialId).toBe('cred-1');
    const creds = await h.adapter.list('user-1');
    expect(creds).toHaveLength(1);
    expect(creds[0]!.deviceName).toBe('MacBook');
  });

  it('throws PASSKEY_VERIFY_FAILED when verification fails', async () => {
    verifyRegistrationResponse.mockResolvedValueOnce({ verified: false } as never);
    const h = makeHarness();
    await expect(
      h.api.registerVerify('user-1', { response: {}, expectedChallenge: 'c' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_VERIFY_FAILED' });
  });

  it('throws PASSKEY_VERIFY_FAILED when registrationInfo is missing', async () => {
    verifyRegistrationResponse.mockResolvedValueOnce({ verified: true } as never);
    const h = makeHarness();
    await expect(
      h.api.registerVerify('user-1', { response: {}, expectedChallenge: 'c' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_VERIFY_FAILED' });
  });

  it('handles the legacy simplewebauthn shape (credentialID / credentialPublicKey)', async () => {
    verifyRegistrationResponse.mockResolvedValueOnce({
      verified: true,
      registrationInfo: {
        credentialID: new Uint8Array([9, 9, 9]),
        credentialPublicKey: new Uint8Array([8, 8, 8]),
        counter: 7,
      },
    } as never);
    const h = makeHarness();
    const out = await h.api.registerVerify('user-1', {
      response: {},
      expectedChallenge: 'c',
    });
    expect(typeof out.credentialId).toBe('string');
    const rec = (await h.adapter.list('user-1'))[0]!;
    expect(rec.counter).toBe(7);
  });

  it('rejects invalid expectedChallenge', async () => {
    const h = makeHarness();
    await expect(
      h.api.registerVerify('user-1', { response: {}, expectedChallenge: '' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_INVALID_INPUT' });
  });

  it('stores deviceName as null when an empty string is provided', async () => {
    const h = makeHarness();
    await h.api.registerVerify('user-1', {
      response: {},
      expectedChallenge: 'c',
      deviceName: '',
    });
    const rec = (await h.adapter.list('user-1'))[0]!;
    expect(rec.deviceName).toBeNull();
  });
});

/* ────────────────── loginOptions ────────────────── */

describe('passkey.api — loginOptions', () => {
  it('returns discoverable-credential options when no userId is passed', async () => {
    const h = makeHarness();
    const out = await h.api.loginOptions();
    expect(out.challenge).toBe('login-challenge');
    const args = generateAuthenticationOptions.mock.calls[0]![0] as { allowCredentials: unknown };
    expect(args.allowCredentials).toBeUndefined();
  });

  it('populates allowCredentials when the user has keys', async () => {
    const h = makeHarness();
    await h.adapter.create({
      userId: 'user-1', credentialId: 'known-cred', publicKey: 'pk', counter: 0,
      transports: null, deviceName: null,
    });
    await h.api.loginOptions('user-1');
    const args = generateAuthenticationOptions.mock.calls[0]![0] as {
      allowCredentials: { id: string }[];
    };
    expect(args.allowCredentials).toEqual([{ id: 'known-cred', transports: undefined }]);
  });

  it('returns undefined allowCredentials when the user has no keys (anti-enumeration)', async () => {
    const h = makeHarness();
    await h.api.loginOptions('user-1');
    const args = generateAuthenticationOptions.mock.calls[0]![0] as { allowCredentials: unknown };
    expect(args.allowCredentials).toBeUndefined();
  });

  it('rejects an invalid userId', async () => {
    const h = makeHarness();
    await expect(h.api.loginOptions(123 as unknown as string)).rejects.toMatchObject({
      code: 'PASSKEY_INVALID_INPUT',
    });
  });
});

/* ────────────────── loginVerify ────────────────── */

describe('passkey.api — loginVerify', () => {
  async function seedCredential(h: Harness, overrides: Partial<PasskeyRecord> = {}) {
    await h.adapter.create({
      userId: 'user-1',
      credentialId: 'cred-1',
      publicKey: 'AQIDBA',
      counter: 0,
      transports: null,
      deviceName: null,
      ...overrides,
    });
  }

  it('succeeds with a known credential and returns tokens', async () => {
    const h = makeHarness();
    await seedCredential(h);
    const out = await h.api.loginVerify({
      response: { id: 'cred-1' },
      expectedChallenge: 'login-challenge',
      ip: '127.0.0.1',
    });
    expect(out.user.id).toBe('user-1');
    expect(h.completeSignIn).toHaveBeenCalled();
    expect(h.adapter.store.get('pk-1')?.counter).toBe(1);
  });

  it('falls back to rawId when id is missing', async () => {
    const h = makeHarness();
    await seedCredential(h);
    await h.api.loginVerify({
      response: { rawId: 'cred-1' },
      expectedChallenge: 'login-challenge',
    });
    expect(verifyAuthenticationResponse).toHaveBeenCalled();
  });

  it('throws PASSKEY_INVALID_INPUT when neither id nor rawId are present', async () => {
    const h = makeHarness();
    await expect(
      h.api.loginVerify({ response: {}, expectedChallenge: 'login-challenge' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_INVALID_INPUT' });
  });

  it('throws PASSKEY_INVALID_INPUT for over-long credentialId', async () => {
    const h = makeHarness();
    await expect(
      h.api.loginVerify({ response: { id: 'x'.repeat(1000) }, expectedChallenge: 'c' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_INVALID_INPUT' });
  });

  it('throws PASSKEY_UNKNOWN when the credential is not stored', async () => {
    const h = makeHarness();
    await expect(
      h.api.loginVerify({ response: { id: 'nope' }, expectedChallenge: 'c' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_UNKNOWN' });
  });

  it('throws PASSKEY_VERIFY_FAILED when verification fails', async () => {
    verifyAuthenticationResponse.mockResolvedValueOnce({ verified: false } as never);
    const h = makeHarness();
    await seedCredential(h);
    await expect(
      h.api.loginVerify({ response: { id: 'cred-1' }, expectedChallenge: 'c' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_VERIFY_FAILED' });
  });

  it('rejects counter regression (cloned authenticator)', async () => {
    verifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    } as never);
    const h = makeHarness();
    await seedCredential(h, { counter: 10 });
    await expect(
      h.api.loginVerify({ response: { id: 'cred-1' }, expectedChallenge: 'c' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_COUNTER_REGRESSION' });
  });

  it('allows counter == 0 (some authenticators never increment)', async () => {
    verifyAuthenticationResponse.mockResolvedValueOnce({
      verified: true,
      authenticationInfo: { newCounter: 0 },
    } as never);
    const h = makeHarness();
    await seedCredential(h, { counter: 0 });
    await expect(
      h.api.loginVerify({ response: { id: 'cred-1' }, expectedChallenge: 'c' }),
    ).resolves.toBeDefined();
  });

  it('is gated by the rate limiter', async () => {
    const limiter: PasskeyRateLimiter = {
      check: vi.fn(async () => ({ ok: false, retryAfterSeconds: 30 })),
      reset: vi.fn(async () => {}),
    };
    const h = makeHarness({ rateLimiter: limiter });
    await seedCredential(h);
    await expect(
      h.api.loginVerify({ response: { id: 'cred-1' }, expectedChallenge: 'c', ip: '1.2.3.4' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_RATE_LIMITED', status: 429 });
    expect(limiter.check).toHaveBeenCalledWith('cred-1:1.2.3.4');
  });

  it('calls limiter.reset on success', async () => {
    const limiter: PasskeyRateLimiter = {
      check: vi.fn(async () => ({ ok: true })),
      reset: vi.fn(async () => {}),
    };
    const h = makeHarness({ rateLimiter: limiter });
    await seedCredential(h);
    await h.api.loginVerify({ response: { id: 'cred-1' }, expectedChallenge: 'c' });
    expect(limiter.reset).toHaveBeenCalledWith('cred-1:unknown');
  });

  it('rejects invalid expectedChallenge', async () => {
    const h = makeHarness();
    await seedCredential(h);
    await expect(
      h.api.loginVerify({ response: { id: 'cred-1' }, expectedChallenge: '' }),
    ).rejects.toMatchObject({ code: 'PASSKEY_INVALID_INPUT' });
  });
});

/* ────────────────── list / delete ────────────────── */

describe('passkey.api — list / delete', () => {
  it('list returns credentials for the user', async () => {
    const h = makeHarness();
    await h.adapter.create({
      userId: 'user-1', credentialId: 'c1', publicKey: 'pk', counter: 0,
      transports: null, deviceName: null,
    });
    const out = await h.api.list('user-1');
    expect(out).toHaveLength(1);
  });

  it('list rejects invalid userId', async () => {
    const h = makeHarness();
    await expect(h.api.list('')).rejects.toMatchObject({ code: 'PASSKEY_INVALID_INPUT' });
  });

  it('delete removes an owned credential', async () => {
    const h = makeHarness();
    await h.adapter.create({
      userId: 'user-1', credentialId: 'c1', publicKey: 'pk', counter: 0,
      transports: null, deviceName: null,
    });
    await h.api.delete('user-1', 'c1');
    expect(await h.adapter.list('user-1')).toHaveLength(0);
  });

  it('delete throws NOT_FOUND for an unknown credential', async () => {
    const h = makeHarness();
    await expect(h.api.delete('user-1', 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('delete throws NOT_FOUND when the credential belongs to another user (IDOR)', async () => {
    const h = makeHarness();
    await h.adapter.create({
      userId: 'attacker', credentialId: 'cx', publicKey: 'pk', counter: 0,
      transports: null, deviceName: null,
    });
    await expect(h.api.delete('user-1', 'cx')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/* ────────────────── hooks ────────────────── */

describe('passkey hooks', () => {
  it('userDelete.after purges all credentials for the user', async () => {
    const h = makeHarness();
    await h.adapter.create({
      userId: 'user-1', credentialId: 'c1', publicKey: 'pk', counter: 0,
      transports: null, deviceName: null,
    });
    await h.adapter.create({
      userId: 'user-1', credentialId: 'c2', publicKey: 'pk', counter: 0,
      transports: null, deviceName: null,
    });
    await h.plugin.hooks!.userDelete!.after!({ userId: 'user-1' }, h.ctx);
    expect(await h.adapter.list('user-1')).toHaveLength(0);
  });

  it('userDelete.after logs (does not throw) when list fails', async () => {
    const h = makeHarness();
    h.adapter.list = vi.fn(async () => {
      throw new Error('db offline');
    });
    await h.plugin.hooks!.userDelete!.after!({ userId: 'user-1' }, h.ctx);
    expect(h.logger.error).toHaveBeenCalled();
  });

  it('userDelete.after logs per-credential delete failures', async () => {
    const h = makeHarness();
    await h.adapter.create({
      userId: 'user-1', credentialId: 'c1', publicKey: 'pk', counter: 0,
      transports: null, deviceName: null,
    });
    h.adapter.delete = vi.fn(async () => {
      throw new Error('FK violation');
    });
    await h.plugin.hooks!.userDelete!.after!({ userId: 'user-1' }, h.ctx);
    expect(h.logger.error).toHaveBeenCalled();
  });
});

/* ────────────────── routes ────────────────── */

function makeRctx(overrides: {
  api: PasskeyApi;
  config: HoleauthConfig;
  body?: Record<string, unknown>;
  session?: { userId: string; sessionId: string; expiresAt: number } | null;
  challenge?: string;
}) {
  const cookies: Record<string, string> = {};
  if (overrides.challenge) cookies['holeauth.passkey.challenge'] = overrides.challenge;
  const setCookies: Array<{ name: string; value: string; maxAge?: number }> = [];
  const rctx: PluginRouteContext & { _setCookies: typeof setCookies } = {
    req: new Request('http://localhost/api/auth/passkey'),
    body: overrides.body ?? {},
    responseHeaders: new Headers(),
    cookies: { get: (n) => cookies[n] },
    setCookie: (s) => {
      setCookies.push({ name: s.name, value: s.value, maxAge: s.maxAge });
    },
    getSession: async () =>
      overrides.session === undefined
        ? { userId: 'user-1', sessionId: 'SID', expiresAt: Date.now() + 60_000 }
        : overrides.session,
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

function routeByPath(plugin: ReturnType<typeof passkey>, path: string) {
  const r = plugin.routes!.find((x) => x.path === path);
  if (!r) throw new Error(`route ${path} not found`);
  return r;
}

describe('passkey routes — /passkey/register/options', () => {
  it('401 without session', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config, session: null });
    const res = await routeByPath(h.plugin, '/passkey/register/options').handler!(rctx);
    expect(res.status).toBe(401);
  });

  it('200 and sets the challenge cookie', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config });
    const res = await routeByPath(h.plugin, '/passkey/register/options').handler!(rctx);
    expect(res.status).toBe(200);
    const cookies = (rctx as unknown as { _setCookies: { name: string; value: string }[] })._setCookies;
    expect(cookies.some((c) => c.name === 'holeauth.passkey.challenge' && c.value === 'reg-challenge')).toBe(true);
  });
});

describe('passkey routes — /passkey/register/verify', () => {
  it('401 without session', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config, session: null });
    const res = await routeByPath(h.plugin, '/passkey/register/verify').handler!(rctx);
    expect(res.status).toBe(401);
  });

  it('400 when no challenge cookie', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config });
    const res = await routeByPath(h.plugin, '/passkey/register/verify').handler!(rctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'NO_CHALLENGE' } });
  });

  it('200 on success and clears the challenge cookie', async () => {
    const h = makeHarness();
    const rctx = makeRctx({
      api: h.api,
      config: h.config,
      challenge: 'reg-challenge',
      body: { response: { id: 'cred-1' }, deviceName: 'MacBook' },
    });
    const res = await routeByPath(h.plugin, '/passkey/register/verify').handler!(rctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.credentialId).toBe('cred-1');
    const cookies = (rctx as unknown as { _setCookies: { name: string; maxAge?: number }[] })._setCookies;
    expect(cookies.some((c) => c.name === 'holeauth.passkey.challenge' && c.maxAge === 0)).toBe(true);
  });
});

describe('passkey routes — /passkey/login/options', () => {
  it('200 and sets the challenge cookie; never forwards userId to the API', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config, body: { userId: 'alleged-victim' } });
    const res = await routeByPath(h.plugin, '/passkey/login/options').handler!(rctx);
    expect(res.status).toBe(200);
    // allowCredentials must be undefined regardless of userId input
    const args = generateAuthenticationOptions.mock.calls[0]![0] as { allowCredentials: unknown };
    expect(args.allowCredentials).toBeUndefined();
  });
});

describe('passkey routes — /passkey/login/verify', () => {
  it('400 when no challenge cookie', async () => {
    const h = makeHarness();
    const rctx = makeRctx({ api: h.api, config: h.config });
    const res = await routeByPath(h.plugin, '/passkey/login/verify').handler!(rctx);
    expect(res.status).toBe(400);
  });

  it('200 + sets at/rt/csrf cookies and user payload on success', async () => {
    const h = makeHarness();
    await h.adapter.create({
      userId: 'user-1', credentialId: 'cred-1', publicKey: 'AQIDBA', counter: 0,
      transports: null, deviceName: null,
    });
    const rctx = makeRctx({
      api: h.api,
      config: h.config,
      challenge: 'login-challenge',
      body: { response: { id: 'cred-1' } },
    });
    const res = await routeByPath(h.plugin, '/passkey/login/verify').handler!(rctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.user.id).toBe('user-1');
    expect(body.csrfToken).toBe('CSRF');
    const names = (rctx as unknown as { _setCookies: { name: string }[] })._setCookies.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining([
      'holeauth.at', 'holeauth.rt', 'holeauth.csrf', 'holeauth.passkey.challenge',
    ]));
  });
});

/* ────────────────── webauthn loader ────────────────── */

describe('loadWebAuthn', () => {
  it('throws PASSKEY_NOT_CONFIGURED when the import fails', async () => {
    vi.resetModules();
    vi.doMock('@simplewebauthn/server', () => {
      throw new Error('not installed');
    });
    const { passkey: pkFresh } = await import('../src/index.js');
    const adapter = makeAdapter();
    const plugin = pkFresh({ adapter, rpID: 'x', rpOrigin: 'https://x' });
    const ctx = {
      config: {
        adapters: { user: { getUserById: vi.fn(async () => ({ id: 'user-1', email: 'a' })) } },
        tokens: {},
      },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      events: { on: () => () => {}, off: () => {}, emit: async () => {} },
      core: {} as unknown,
      getPlugin: () => undefined,
      getPluginAdapter: () => undefined,
    } as unknown as PluginContext;
    const api = plugin.api(ctx);
    await expect(api.registerOptions('user-1')).rejects.toMatchObject({
      code: 'PASSKEY_NOT_CONFIGURED',
    });
    vi.doUnmock('@simplewebauthn/server');
    vi.resetModules();
  });
});
