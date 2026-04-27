/**
 * Tests for the in-memory rate limiter.
 */
import { describe, it, expect } from 'vitest';
import { createMemoryRateLimiter } from '../src/rate-limit.js';

describe('createMemoryRateLimiter', () => {
  it('allows requests under the limit', async () => {
    const limiter = createMemoryRateLimiter({ max: 3, windowSeconds: 60 });
    for (let i = 0; i < 3; i++) {
      expect(await limiter.check('k')).toEqual({ ok: true });
    }
  });

  it('blocks with retryAfter once the limit is exceeded', async () => {
    const limiter = createMemoryRateLimiter({ max: 2, windowSeconds: 60 });
    await limiter.check('k');
    await limiter.check('k');
    const r = await limiter.check('k');
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('expires old entries after the window elapses', async () => {
    let now = 1_000_000;
    const limiter = createMemoryRateLimiter({
      max: 2,
      windowSeconds: 1,
      now: () => now,
    });
    await limiter.check('k');
    await limiter.check('k');
    expect((await limiter.check('k')).ok).toBe(false);
    now += 2_000;
    expect(await limiter.check('k')).toEqual({ ok: true });
  });

  it('scopes counters per key', async () => {
    const limiter = createMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    expect(await limiter.check('a')).toEqual({ ok: true });
    expect(await limiter.check('b')).toEqual({ ok: true });
    expect((await limiter.check('a')).ok).toBe(false);
  });

  it('reset() clears a key so it passes again', async () => {
    const limiter = createMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    await limiter.check('k');
    expect((await limiter.check('k')).ok).toBe(false);
    await limiter.reset('k');
    expect(await limiter.check('k')).toEqual({ ok: true });
  });

  it('uses default options when none are supplied', async () => {
    const limiter = createMemoryRateLimiter();
    expect(await limiter.check('k')).toEqual({ ok: true });
  });
});
