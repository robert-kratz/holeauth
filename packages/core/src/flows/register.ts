import type { HoleauthConfig } from '../types/index.js';
import type { AdapterUser } from '../adapters/index.js';
import type { HookRunner } from '../plugins/registry.js';
import { hash as pwHash } from '../password/index.js';
import { AccountConflictError, RegistrationDisabledError } from '../errors/index.js';
import { emit } from '../events/emitter.js';

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export async function register(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  input: RegisterInput,
): Promise<AdapterUser> {
  if (cfg.registration?.selfServe === false) {
    throw new RegistrationDisabledError();
  }
  const email = input.email.trim().toLowerCase();
  await hooks.runRegisterBefore({ email, password: input.password, name: input.name ?? null });

  const existing = await cfg.adapters.user.getUserByEmail(email);
  if (existing) throw new AccountConflictError('email already registered');

  const passwordHash = await pwHash(input.password);
  const user = await cfg.adapters.user.createUser({
    email,
    name: input.name ?? null,
    passwordHash,
    emailVerified: null,
  });

  await emit(cfg, { type: 'user.registered', userId: user.id, data: { email } });
  await hooks.runRegisterAfter(user);
  return user;
}
