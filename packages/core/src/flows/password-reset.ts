import type { HoleauthConfig } from '../types/index.js';
import type { HookRunner } from '../plugins/registry.js';
import { hash as pwHash } from '../password/index.js';
import { CredentialsError, HoleauthError } from '../errors/index.js';
import { revokeAllForUser } from '../session/revoke.js';
import { emit } from '../events/emitter.js';
import { randomBase64Url } from '../utils/base64url.js';
import { runInTransaction } from './tx.js';

const RESET_TTL_SECONDS = 60 * 30; // 30m

function randomToken(bytes = 32): string {
  return randomBase64Url(bytes);
}

function requireVerificationAdapter(cfg: HoleauthConfig) {
  const v = cfg.adapters.verificationToken;
  if (!v) {
    throw new HoleauthError(
      'VERIFICATION_NOT_CONFIGURED',
      'passwordReset requires adapters.verificationToken',
      500,
    );
  }
  return v;
}

/**
 * Step 1 — issue a reset token for the given email. Always resolves
 * successfully (to avoid leaking whether the email exists). Returns the
 * token so consumer code can send it via email; in production the
 * consumer MUST NOT echo this back to the caller.
 */
export async function requestPasswordReset(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  input: { email: string },
): Promise<{ token?: string; userId?: string }> {
  const email = input.email.trim().toLowerCase();
  await hooks.runPasswordResetBefore({ email });
  const user = await cfg.adapters.user.getUserByEmail(email);
  if (!user) {
    // Silent no-op. Do not reveal existence.
    return {};
  }

  const verification = requireVerificationAdapter(cfg);
  const token = randomToken(32);
  await verification.create({
    identifier: email,
    token,
    expiresAt: new Date(Date.now() + RESET_TTL_SECONDS * 1000),
  });

  await emit(cfg, {
    type: 'user.password_reset_requested',
    userId: user.id,
    data: { email },
  });
  await hooks.runPasswordResetAfter({ userId: user.id, stage: 'request' });
  return { token, userId: user.id };
}

export async function consumePasswordReset(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  input: { email: string; token: string; newPassword: string },
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  await hooks.runPasswordResetBefore({ email, token: input.token, newPassword: input.newPassword });
  const verification = requireVerificationAdapter(cfg);
  const row = await verification.consume(email, input.token);
  if (!row) throw new CredentialsError('reset token invalid');
  if (row.expiresAt.getTime() < Date.now()) throw new CredentialsError('reset token expired');

  const user = await cfg.adapters.user.getUserByEmail(email);
  if (!user) throw new CredentialsError();
  const passwordHash = await pwHash(input.newPassword);
  await runInTransaction(cfg, async () => {
    await cfg.adapters.user.updateUser(user.id, { passwordHash });
    await revokeAllForUser(cfg, user.id);
  });
  await emit(cfg, { type: 'user.password_reset', userId: user.id });
  await hooks.runPasswordResetAfter({ userId: user.id, stage: 'consume' });
}
