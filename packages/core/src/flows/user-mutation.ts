import type { HoleauthConfig } from '../types/index.js';
import type { AdapterUser } from '../adapters/index.js';
import type { HookRunner } from '../plugins/registry.js';
import { revokeAllForUser } from '../session/revoke.js';
import { CredentialsError } from '../errors/index.js';
import { emit } from '../events/emitter.js';
import { runInTransaction } from './tx.js';

export async function updateUser(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  userId: string,
  patch: Partial<AdapterUser>,
): Promise<AdapterUser> {
  // Prevent direct password mutation through updateUser — force changePassword.
  if ('passwordHash' in patch) {
    throw new CredentialsError('use changePassword to update passwords');
  }
  const next = await cfg.adapters.user.updateUser(userId, patch);
  await emit(cfg, { type: 'user.updated', userId, data: { patch: Object.keys(patch) } });
  await hooks.runUserUpdateAfter({ user: next, patch });
  return next;
}

export async function deleteUser(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  userId: string,
): Promise<void> {
  // Plugin cleanup runs BEFORE deleting the row so hooks can still
  // reference the user. If plugin cleanup throws, the user row is left
  // intact (caller can retry).
  await emit(cfg, { type: 'user.delete_requested', userId });
  await hooks.runUserDeleteAfter({ userId });
  await runInTransaction(cfg, async () => {
    await revokeAllForUser(cfg, userId);
    await cfg.adapters.user.deleteUser(userId);
  });
  await emit(cfg, { type: 'user.deleted', userId });
}
