/**
 * Built-in in-memory MagicLinkAdapter for headless / development use.
 *
 * No external dependencies. Suitable for tests, local dev, and Edge/serverless
 * environments where a persistent store is not yet wired.
 *
 * ⚠ Not suitable for multi-process / multi-instance deployments: each process
 * maintains its own independent token store. For production use the Drizzle
 * adapter (@holeauth/magic-link-drizzle) or supply a custom adapter backed by
 * Redis / a shared KV store.
 */

import type {
  MagicLinkAdapter,
  MagicLinkRecord,
  MagicLinkTokenType,
  CreateMagicLinkInput,
} from './adapter.js';

export function createMemoryAdapter(): MagicLinkAdapter {
  // Primary index: tokenHash → record
  const byHash = new Map<string, MagicLinkRecord>();
  // Secondary index: `identifier:type` → Set of tokenHashes (for fast lookup by email+type)
  const byIdentifier = new Map<string, Set<string>>();

  function idxKey(identifier: string, type: MagicLinkTokenType): string {
    return `${identifier}:${type}`;
  }

  function addIndex(record: MagicLinkRecord): void {
    const k = idxKey(record.identifier, record.type);
    if (!byIdentifier.has(k)) byIdentifier.set(k, new Set());
    byIdentifier.get(k)!.add(record.tokenHash);
  }

  function removeFromIndex(record: MagicLinkRecord): void {
    const k = idxKey(record.identifier, record.type);
    byIdentifier.get(k)?.delete(record.tokenHash);
  }

  function getByIdentifierType(identifier: string, type: MagicLinkTokenType): MagicLinkRecord[] {
    const k = idxKey(identifier, type);
    const hashes = byIdentifier.get(k);
    if (!hashes) return [];
    const records: MagicLinkRecord[] = [];
    for (const hash of hashes) {
      const r = byHash.get(hash);
      if (r) records.push(r);
    }
    return records;
  }

  return {
    async createToken(input: CreateMagicLinkInput): Promise<MagicLinkRecord> {
      const record: MagicLinkRecord = {
        id: crypto.randomUUID(),
        identifier: input.identifier,
        tokenHash: input.tokenHash,
        type: input.type,
        userId: input.userId ?? null,
        usedAt: null,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
      };
      byHash.set(record.tokenHash, record);
      addIndex(record);
      return { ...record };
    },

    async findByTokenHash(tokenHash: string): Promise<MagicLinkRecord | null> {
      const r = byHash.get(tokenHash);
      return r ? { ...r } : null;
    },

    async findActiveToken(
      identifier: string,
      type: MagicLinkTokenType,
    ): Promise<MagicLinkRecord | null> {
      const now = new Date();
      const candidates = getByIdentifierType(identifier, type)
        .filter((r) => !r.usedAt && r.expiresAt > now)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return candidates[0] ? { ...candidates[0] } : null;
    },

    async findActiveOtp(identifier: string): Promise<MagicLinkRecord | null> {
      // Deprecated — delegates to findActiveToken for consistency.
      const now = new Date();
      const candidates = getByIdentifierType(identifier, 'otp')
        .filter((r) => !r.usedAt && r.expiresAt > now)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return candidates[0] ? { ...candidates[0] } : null;
    },

    /**
     * Atomic consume by hash.
     *
     * In the single-threaded JS event loop there is no `await` between the
     * validity check and the mutation, so the operation is effectively atomic
     * within one process. This does NOT protect against concurrent processes.
     */
    async atomicConsumeByHash(tokenHash: string): Promise<MagicLinkRecord | null> {
      const record = byHash.get(tokenHash);
      if (!record) return null;
      if (record.usedAt) return null;
      if (record.expiresAt <= new Date()) return null;
      // Synchronous mutation — no await between check and write.
      record.usedAt = new Date();
      return { ...record };
    },

    /**
     * Atomic consume by ID.
     *
     * Same single-threaded atomicity guarantee as atomicConsumeByHash.
     * No expiry check — callers must pre-filter via findActiveToken.
     */
    async atomicConsumeById(id: string): Promise<MagicLinkRecord | null> {
      // Linear scan — acceptable for dev/test where the store is small.
      for (const record of byHash.values()) {
        if (record.id === id) {
          if (record.usedAt) return null;
          // Synchronous mutation — no await between check and write.
          record.usedAt = new Date();
          return { ...record };
        }
      }
      return null;
    },

    async deleteByIdentifier(identifier: string, type?: MagicLinkTokenType): Promise<void> {
      const types: MagicLinkTokenType[] = type ? [type] : ['magic-link', 'otp'];
      for (const t of types) {
        const records = getByIdentifierType(identifier, t);
        for (const r of records) {
          byHash.delete(r.tokenHash);
          removeFromIndex(r);
        }
      }
    },

    async deleteExpired(): Promise<void> {
      const now = new Date();
      for (const [hash, record] of byHash) {
        if (record.expiresAt <= now) {
          removeFromIndex(record);
          byHash.delete(hash);
        }
      }
    },

    async deleteByUserId(userId: string): Promise<void> {
      for (const [hash, record] of byHash) {
        if (record.userId === userId) {
          removeFromIndex(record);
          byHash.delete(hash);
        }
      }
    },

    async findLatestByIdentifier(
      identifier: string,
      type: MagicLinkTokenType,
    ): Promise<MagicLinkRecord | null> {
      const candidates = getByIdentifierType(identifier, type).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
      return candidates[0] ? { ...candidates[0] } : null;
    },
  };
}
