/**
 * Tests for the in-memory passkey rate limiter.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMemoryRateLimiter } from '../src/rate-limit.js';

describe('plugin-passkey — createMemoryRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  it('allows up to max attempts, then rejects', async () => {
    const limiter = createMemoryRateLimiter({ max: 3, windowSeconds: 60 });
    expect((await limiter.check('k')).ok).toBe(true);
    expect((await limiter.check('k')).ok).toBe(true);
    expect((await limiter.check('k')).ok).toBe(true);
    const res = await limiter.check('k');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('prunes entries older than the window and allows again', async () => {
    const limiter = createMemoryRateLimiter({ max: 2, windowSeconds: 30 });
    await limiter.check('k');
    await limiter.check('k');
    const rejected = await limiter.check('k');
    expect(rejected.ok).toBe(false);
    vi.advanceTimersByTime(31_000);
    expect((await limiter.check('k')).ok).toBe(true);
  });

  it('reset clears the bucket', async () => {
    const limiter = createMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    await limiter.check('k');
    expect((await limiter.check('k')).ok).toBe(false);
    await limiter.reset('k');
    expect((await limiter.check('k')).ok).toBe(true);
  });

  it('isolates buckets by key', async () => {
    const limiter = createMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    expect((await limiter.check('a')).ok).toBe(true);
    expect((await limiter.check('b')).ok).toBe(true);
    expect((await limiter.check('a')).ok).toBe(false);
  });

  it('accepts a custom now() provider', async () => {
    let t = 1_000_000;
    const limiter = createMemoryRateLimiter({ max: 1, windowSeconds: 10, now: () => t });
    await limiter.check('k');
    expect((await limiter.check('k')).ok).toBe(false);
    t += 11_000;
    expect((await limiter.check('k')).ok).toBe(true);
  });

  it('uses sensible defaults when no options are supplied', async () => {
    const limiter = createMemoryRateLimiter();
    expect((await limiter.check('k')).ok).toBe(true);
  });

  it('returns at least 1 second in retryAfterSeconds', async () => {
    const limiter = createMemoryRateLimiter({ max: 1, windowSeconds: 1 });
    await limiter.check('k');
    const res = await limiter.check('k');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
