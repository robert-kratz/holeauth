import type {
  HoleauthConfig,
  InviteInput,
  InviteClaims,
  CreateInviteResult,
  ConsumeInviteInput,
  ConsumeInviteResult,
  InviteListEntry,
} from '../types/index.js';
import type { HookRunner } from '../plugins/registry.js';
import {
  HoleauthError,
  AccountConflictError,
  CredentialsError,
  NotSupportedError,
} from '../errors/index.js';
import { hash as pwHash } from '../password/index.js';
import { sign, verify } from '../jwt/index.js';
import { sha256b64url } from '../session/hash.js';
import { randomBase64Url } from '../utils/base64url.js';
import { issueSession } from '../session/issue.js';
import { emit } from '../events/emitter.js';
import type { JWTPayload } from 'jose';

const INVITE_PREFIX = 'invite:';
const TOKEN_TYPE = 'invite';

interface RawInviteJWT extends JWTPayload {
  sub?: string;
  name?: string | null;
  gid?: string[];
  by?: string | null;
  meta?: Record<string, unknown> | null;
  typ?: string;
  exp?: number;
  jti?: string;
}

function requireVerification(cfg: HoleauthConfig) {
  const v = cfg.adapters.verificationToken;
  if (!v) {
    throw new HoleauthError(
      'VERIFICATION_NOT_CONFIGURED',
      'invites require adapters.verificationToken',
      500,
    );
  }
  return v;
}

function buildIdentifier(email: string): string {
  const rand = randomBase64Url(9);
  return `${INVITE_PREFIX}${email}:${rand}`;
}

function parseIdentifier(identifier: string): { email: string } | null {
  if (!identifier.startsWith(INVITE_PREFIX)) return null;
  const rest = identifier.slice(INVITE_PREFIX.length);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon < 0) return null;
  return { email: rest.slice(0, lastColon) };
}

export async function createInvite(
  cfg: HoleauthConfig,
  _hooks: HookRunner,
  input: InviteInput,
): Promise<CreateInviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) {
    throw new HoleauthError('INVALID_EMAIL', 'invalid email', 400);
  }
  const existing = await cfg.adapters.user.getUserByEmail(email);
  if (existing) {
    throw new AccountConflictError('user with this email already exists');
  }

  const ttl = input.ttlSeconds ?? cfg.registration?.inviteTtlSeconds;
  if (!ttl || ttl <= 0) {
    throw new HoleauthError(
      'TTL_REQUIRED',
      'invite TTL is required (set input.ttlSeconds or config.registration.inviteTtlSeconds)',
      400,
    );
  }

  const verification = requireVerification(cfg);
  const identifier = buildIdentifier(email);
  const expSeconds = Math.floor(Date.now() / 1000) + ttl;
  const expiresAt = new Date(expSeconds * 1000);

  const token = await sign(
    {
      sub: email,
      name: input.name ?? null,
      gid: input.groupIds ?? [],
      by: input.invitedBy ?? null,
      meta: input.metadata ?? null,
      typ: TOKEN_TYPE,
    },
    cfg.secrets.jwtSecret,
    { expiresIn: `${ttl}s`, jti: identifier, subject: email },
  );

  const tokenHash = await sha256b64url(token);
  await verification.create({ identifier, token: tokenHash, expiresAt });

  const url = cfg.registration?.inviteUrl?.({ token, email }) ?? undefined;

  await emit(cfg, {
    type: 'user.invited',
    userId: input.invitedBy ?? null,
    data: { email, identifier, groupIds: input.groupIds ?? [] },
  });

  return { token, url, identifier, expiresAt: expSeconds * 1000 };
}

async function decodeInvite(cfg: HoleauthConfig, token: string): Promise<InviteClaims> {
  const claims = await verify<RawInviteJWT>(token, cfg.secrets.jwtSecret);
  if (claims.typ !== TOKEN_TYPE) {
    throw new CredentialsError('not an invite token');
  }
  if (!claims.sub || !claims.jti) {
    throw new CredentialsError('invite token missing claims');
  }
  return {
    email: claims.sub,
    name: claims.name ?? null,
    groupIds: claims.gid ?? [],
    invitedBy: claims.by ?? null,
    metadata: claims.meta ?? null,
    expiresAt: (claims.exp ?? 0) * 1000,
    identifier: claims.jti,
  };
}

export async function getInviteInfo(
  cfg: HoleauthConfig,
  input: { token: string },
): Promise<InviteClaims> {
  return decodeInvite(cfg, input.token);
}

export async function consumeInvite(
  cfg: HoleauthConfig,
  hooks: HookRunner,
  input: ConsumeInviteInput,
): Promise<ConsumeInviteResult> {
  const claims = await decodeInvite(cfg, input.token);
  const email = claims.email.trim().toLowerCase();

  const verification = requireVerification(cfg);
  const tokenHash = await sha256b64url(input.token);
  const row = await verification.consume(claims.identifier, tokenHash);
  if (!row) throw new CredentialsError('invite invalid or already used');
  if (row.expiresAt.getTime() < Date.now()) {
    throw new CredentialsError('invite expired');
  }

  await hooks.runRegisterBefore({
    email,
    password: input.password,
    name: input.name ?? claims.name ?? null,
  });

  const existing = await cfg.adapters.user.getUserByEmail(email);
  if (existing) throw new AccountConflictError('email already registered');

  const passwordHash = await pwHash(input.password);
  const user = await cfg.adapters.user.createUser({
    email,
    name: input.name ?? claims.name ?? null,
    passwordHash,
    emailVerified: new Date(),
  });

  await emit(cfg, { type: 'user.registered', userId: user.id, data: { email, via: 'invite' } });
  await emit(cfg, {
    type: 'user.invite_consumed',
    userId: user.id,
    data: {
      email,
      identifier: claims.identifier,
      groupIds: claims.groupIds ?? [],
      invitedBy: claims.invitedBy ?? null,
      metadata: claims.metadata ?? null,
    },
  });
  await hooks.runRegisterAfter(user);

  let tokens;
  if (input.autoSignIn) {
    tokens = await issueSession(cfg, {
      userId: user.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    });
    await emit(cfg, {
      type: 'user.signed_in',
      userId: user.id,
      sessionId: tokens.sessionId,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      data: { method: 'invite' },
    });
  }

  return { user, tokens, groupIds: claims.groupIds ?? [] };
}

export async function revokeInvite(
  cfg: HoleauthConfig,
  input: { identifier: string },
): Promise<void> {
  const verification = requireVerification(cfg);
  if (!verification.deleteByIdentifier) {
    throw new NotSupportedError('verificationToken adapter does not support deleteByIdentifier');
  }
  await verification.deleteByIdentifier(input.identifier);
  await emit(cfg, {
    type: 'user.invite_revoked',
    data: { identifier: input.identifier },
  });
}

export async function listInvites(cfg: HoleauthConfig): Promise<InviteListEntry[]> {
  const verification = requireVerification(cfg);
  if (!verification.listByIdentifierPrefix) {
    throw new NotSupportedError(
      'verificationToken adapter does not support listByIdentifierPrefix',
    );
  }
  const rows = await verification.listByIdentifierPrefix(INVITE_PREFIX);
  const out: InviteListEntry[] = [];
  for (const r of rows) {
    const parsed = parseIdentifier(r.identifier);
    if (!parsed) continue;
    out.push({
      identifier: r.identifier,
      email: parsed.email,
      expiresAt: r.expiresAt.getTime(),
    });
  }
  return out;
}
