import type { HoleauthConfig } from '../types/index.js';
import type { HookRunner } from '../plugins/registry.js';
import { hash as pwHash, verify as pwVerify } from '../password/index.js';
import { CredentialsError } from '../errors/index.js';
import { revokeAllForUser } from '../session/revoke.js';
import { emit } from '../events/emitter.js';
import { runInTransaction } from './tx.js';

export interface PasswordChangeInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
  /** If true, revoke all other sessions after change. Default: true. */
  revokeOtherSessions?: boolean;
}

export async function changePassword(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  input: PasswordChangeInput,
): Promise<void> {
  await hooks.runPasswordChangeBefore(input);

  const user = await cfg.adapters.user.getUserById(input.userId);
  if (!user || !user.passwordHash) throw new CredentialsError('user has no password');

  const ok = await pwVerify(input.currentPassword, user.passwordHash);
  if (!ok) throw new CredentialsError();

  const passwordHash = await pwHash(input.newPassword);
  await runInTransaction(cfg, async () => {
    await cfg.adapters.user.updateUser(user.id, { passwordHash });
    if (input.revokeOtherSessions !== false) {
      await revokeAllForUser(cfg, user.id);
    }
  });

  await emit(cfg, { type: 'user.password_changed', userId: user.id });
  await hooks.runPasswordChangeAfter({ userId: user.id });
}
