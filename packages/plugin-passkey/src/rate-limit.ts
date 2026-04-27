/**
 * In-memory brute-force guard for the passkey login verify endpoint.
 *
 * Keys are expected to combine the credential id and the caller IP, so a
 * legitimate user on a new network is not locked out by a distant attacker.
 * Swap this for a Redis-backed limiter in production deployments.
 */
export interface PasskeyRateLimiter {
  check(key: string): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }>;
  reset(key: string): Promise<void>;
}

export interface MemoryRateLimiterOptions {
  max?: number;
  windowSeconds?: number;
  now?: () => number;
}

export function createMemoryRateLimiter(
  opts: MemoryRateLimiterOptions = {},
): PasskeyRateLimiter {
  const max = opts.max ?? 10;
  const windowMs = (opts.windowSeconds ?? 300) * 1000;
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, number[]>();

  function prune(key: string, t: number): number[] {
    const cutoff = t - windowMs;
    const arr = (buckets.get(key) ?? []).filter((ts) => ts > cutoff);
    buckets.set(key, arr);
    return arr;
  }

  return {
    async check(key) {
      const t = now();
      const arr = prune(key, t);
      if (arr.length >= max) {
        const oldest = arr[0]!;
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - t) / 1000)) };
      }
      arr.push(t);
      buckets.set(key, arr);
      return { ok: true };
    },
    async reset(key) {
      buckets.delete(key);
    },
  };
}
