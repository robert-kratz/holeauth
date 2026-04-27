/**
 * In-memory brute-force guard for the IdP token endpoint.
 *
 * Keys are expected to combine the client_id and the caller IP so that one
 * misbehaving client does not lock out others. Swap for a Redis-backed
 * limiter in production deployments.
 */
export interface IdpRateLimiter {
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
): IdpRateLimiter {
  const max = opts.max ?? 20;
  const windowMs = (opts.windowSeconds ?? 60) * 1000;
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
        const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - t) / 1000));
        return { ok: false, retryAfterSeconds: retryAfter };
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
