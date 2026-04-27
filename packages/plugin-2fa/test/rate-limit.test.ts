import { describe, it, expect, vi } from 'vitest';
import { createMemoryRateLimiter } from '../src/rate-limit.js';

describe('createMemoryRateLimiter', () => {
  it('allows up to `max` attempts within the window', async () => {
    const l = createMemoryRateLimiter({ max: 3, windowSeconds: 60 });
    expect((await l.check('k')).ok).toBe(true);
    expect((await l.check('k')).ok).toBe(true);
    expect((await l.check('k')).ok).toBe(true);
    const blocked = await l.check('k');
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('uses default options when none supplied', async () => {
    const l = createMemoryRateLimiter();
    for (let i = 0; i < 5; i++) {
      expect((await l.check('d')).ok).toBe(true);
    }
    expect((await l.check('d')).ok).toBe(false);
  });

  it('isolates buckets per key', async () => {
    const l = createMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    expect((await l.check('a')).ok).toBe(true);
    expect((await l.check('a')).ok).toBe(false);
    expect((await l.check('b')).ok).toBe(true);
  });

  it('reset() clears the bucket', async () => {
    const l = createMemoryRateLimiter({ max: 1, windowSeconds: 60 });
    await l.check('x');
    expect((await l.check('x')).ok).toBe(false);
    await l.reset('x');
    expect((await l.check('x')).ok).toBe(true);
  });

  it('prunes attempts that age out of the window', async () => {
    vi.useFakeTimers();
    try {
      const now = 1_000_000;
      vi.setSystemTime(now);
      const l = createMemoryRateLimiter({ max: 2, windowSeconds: 10 });
      expect((await l.check('t')).ok).toBe(true);
      expect((await l.check('t')).ok).toBe(true);
      expect((await l.check('t')).ok).toBe(false);
      vi.setSystemTime(now + 11_000);
      expect((await l.check('t')).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
