import type { HoleauthConfig } from '../types/index.js';

/**
 * Run `fn` inside the configured transaction, or sequentially if no
 * transaction adapter was supplied.
 */
export async function runInTransaction<T>(cfg: HoleauthConfig, fn: () => Promise<T>): Promise<T> {
  const tx = cfg.adapters.transaction;
  if (!tx) return fn();
  return tx.run(fn);
}
