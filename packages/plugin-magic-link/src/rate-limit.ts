/**
 * Rate-limit hook for magic-link / OTP request and verification.
 *
 * Two surfaces in this plugin must be limited:
 *  - `/magic-link/request` (per email + per IP) to prevent email spam.
 *  - `/magic-link/verify-otp` (per email) to prevent OTP brute-force.
 *
 * Ships an in-memory fallback identical in shape to plugin-2fa so consumers
 * can swap in a Redis-backed limiter in production.
 */

export interface MagicLinkRateLimiter {
  check(key: string): Promise<{ ok: boolean; retryAfterSeconds?: number }>;
  reset(key: string): Promise<void>;
}

export interface MemoryRateLimiterOptions {
  /** Attempts allowed in the window. Default: 5. */
  max?: number;
  /** Rolling window in seconds. Default: 300 (5 min). */
  windowSeconds?: number;
}

export function createMemoryRateLimiter(
  options: MemoryRateLimiterOptions = {},
): MagicLinkRateLimiter {
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
