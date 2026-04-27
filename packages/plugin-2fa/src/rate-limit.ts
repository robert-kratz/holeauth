/**
 * Rate-limit hook for 2FA code verification.
 *
 * A 6-digit TOTP code only spans 10^6 possibilities and recovery codes are
 * ~60 bits of entropy, so unthrottled verification is brute-forceable given
 * enough time. Plugin consumers should supply a rate limiter backed by
 * their infrastructure (Redis, Upstash, etc.); this module ships a simple
 * in-memory fallback that is fine for dev / single-process deployments but
 * MUST NOT be used on horizontally-scaled workers.
 */

export interface TwoFactorRateLimiter {
  /**
   * Record an attempt and decide whether it may proceed. Called BEFORE the
   * verification attempt. Implementations should ideally not increment the
   * counter on explicit success (see {@link TwoFactorRateLimiter.reset}).
   *
   * @returns `ok: true` to permit the attempt, otherwise the hook rejects
   *          with a `TWOFA_RATE_LIMITED` error.
   */
  check(key: string): Promise<{ ok: boolean; retryAfterSeconds?: number }>;
  /** Clear the bucket for `key` after a successful attempt. */
  reset(key: string): Promise<void>;
}

export interface MemoryRateLimiterOptions {
  /** Attempts allowed in the window. Default: 5. */
  max?: number;
  /** Rolling window in seconds. Default: 300 (5 min). */
  windowSeconds?: number;
}

/**
 * Create a simple in-memory limiter. Each `check()` increments the counter;
 * once `max` attempts are recorded within `windowSeconds`, further calls
 * return `{ ok: false }` until the oldest recorded attempt ages out.
 */
export function createMemoryRateLimiter(
  options: MemoryRateLimiterOptions = {},
): TwoFactorRateLimiter {
  const max = options.max ?? 5;
  const windowMs = (options.windowSeconds ?? 300) * 1000;
  const buckets = new Map<string, number[]>();

  const prune = (now: number, arr: number[]): number[] => {
    const cutoff = now - windowMs;
    let i = 0;
    while (i < arr.length && arr[i]! < cutoff) i++;
    return i === 0 ? arr : arr.slice(i);
  };

  return {
    async check(key) {
      const now = Date.now();
      const prev = buckets.get(key) ?? [];
      const pruned = prune(now, prev);
      if (pruned.length >= max) {
        const retry = Math.max(1, Math.ceil((pruned[0]! + windowMs - now) / 1000));
        buckets.set(key, pruned);
        return { ok: false, retryAfterSeconds: retry };
      }
      pruned.push(now);
      buckets.set(key, pruned);
      return { ok: true };
    },
    async reset(key) {
      buckets.delete(key);
    },
  };
}
