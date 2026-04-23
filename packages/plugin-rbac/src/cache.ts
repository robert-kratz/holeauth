/**
 * Optional cache abstraction. Default implementation is an in-memory
 * TTL map (see `defaultRbacCache`). Users can plug in Redis by
 * implementing this interface.
 */
export interface RbacCacheAdapter {
  get(userId: string): string[] | undefined | Promise<string[] | undefined>;
  set(userId: string, nodes: string[]): void | Promise<void>;
  invalidate(userId: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

interface CacheEntry {
  at: number;
  value: string[];
}

export function defaultRbacCache(ttlMs: number): RbacCacheAdapter {
  const map = new Map<string, CacheEntry>();
  return {
    get(userId) {
      const e = map.get(userId);
      if (!e) return undefined;
      if (Date.now() - e.at > ttlMs) {
        map.delete(userId);
        return undefined;
      }
      return e.value;
    },
    set(userId, nodes) {
      map.set(userId, { at: Date.now(), value: nodes });
    },
    invalidate(userId) {
      map.delete(userId);
    },
    clear() {
      map.clear();
    },
  };
}
