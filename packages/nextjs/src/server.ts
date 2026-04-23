/**
 * Server-component/RSC helpers for Next.js App Router.
 *
 * `validateCurrentRequest` is the one-stop guard for server components and
 * route handlers — it reads the session cookie, optionally loads the user
 * row + RBAC snapshot, and either returns the data or `redirect()`s to the
 * login page.
 */
import { redirect } from 'next/navigation';
import type { HoleauthInstance } from '@holeauth/core';
import type { AdapterUser } from '@holeauth/core/adapters';

export interface ValidateRequestOptions {
  /** Required permission(s). AND semantics. Requires plugin-rbac. */
  permissions?: string | string[];
  /** Any-of permissions. OR semantics. Requires plugin-rbac. */
  anyPermission?: string[];
  /** Required group id(s). AND semantics. Requires plugin-rbac. */
  groups?: string | string[];
  /** Where to redirect when auth/permission check fails. Default '/login'. */
  redirectTo?: string;
  /** Load the full user row from the user adapter. Default false. */
  loadUser?: boolean;
  /** Throw instead of redirect on failure. Default false. */
  throwOnFail?: boolean;
}

export interface ValidatedRequest {
  session: NonNullable<Awaited<ReturnType<HoleauthInstance['getSession']>>>;
  user?: AdapterUser;
  permissions?: string[];
  groups?: string[];
}

const toArr = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/** Narrow unknown plugin API to the subset of RBAC methods we use. */
interface RbacApiShape {
  canAll(userId: string, nodes: string[]): Promise<boolean>;
  canAny(userId: string, nodes: string[]): Promise<boolean>;
  getUserPermissions(userId: string): Promise<string[]>;
  getUserGroups(
    userId: string,
  ): Promise<Array<{ id: string }>> | Promise<string[]>;
}

function getRbacApi(auth: HoleauthInstance): RbacApiShape | null {
  // Plugins live as `auth[pluginId]` per PluginsApi merge in define.ts
  // (see `@holeauth/core/define.ts`).
  const maybe = (auth as unknown as Record<string, unknown>)['rbac'];
  if (!maybe || typeof maybe !== 'object') return null;
  return maybe as RbacApiShape;
}

/**
 * Validate the current Next.js request and return session + optional user +
 * optional rbac data. Redirects (or throws) on failure.
 */
export async function validateCurrentRequest(
  auth: HoleauthInstance,
  opts: ValidateRequestOptions = {},
): Promise<ValidatedRequest> {
  const {
    permissions,
    anyPermission,
    groups,
    redirectTo = '/login',
    loadUser = false,
    throwOnFail = false,
  } = opts;

  const fail = (reason: string): never => {
    if (throwOnFail) throw new Error(`[holeauth] validateCurrentRequest failed: ${reason}`);
    redirect(redirectTo);
  };

  const session = await auth.getSession();
  if (!session) return fail('no-session');

  const userId = (session as { sub?: string; userId?: string }).sub
    ?? (session as { userId?: string }).userId;
  if (!userId) return fail('no-user-id');

  let user: AdapterUser | undefined;
  if (loadUser) {
    const u = await auth.config.adapters.user.getUserById(userId);
    if (!u) return fail('user-deleted');
    user = u;
  }

  const reqPerms = toArr(permissions);
  const reqGroups = toArr(groups);
  const reqAnyPerm = anyPermission ?? [];

  let permsList: string[] | undefined;
  let groupsList: string[] | undefined;

  if (reqPerms.length || reqAnyPerm.length || reqGroups.length) {
    const rbac = getRbacApi(auth);
    if (!rbac) {
      throw new Error(
        '[holeauth] validateCurrentRequest got permissions/groups but plugin-rbac is not installed.',
      );
    }

    if (reqPerms.length) {
      const ok = await rbac.canAll(userId, reqPerms);
      if (!ok) return fail('permission-denied');
    }
    if (reqAnyPerm.length) {
      const ok = await rbac.canAny(userId, reqAnyPerm);
      if (!ok) return fail('permission-denied');
    }
    if (reqGroups.length) {
      const userGroups = await rbac.getUserGroups(userId);
      const ids = userGroups.map((g) =>
        typeof g === 'string' ? g : g.id,
      );
      const missing = reqGroups.filter((g) => !ids.includes(g));
      if (missing.length) return fail('group-denied');
      groupsList = ids;
    }

    if (loadUser) {
      permsList = await rbac.getUserPermissions(userId);
      if (!groupsList) {
        const userGroups = await rbac.getUserGroups(userId);
        groupsList = userGroups.map((g) => (typeof g === 'string' ? g : g.id));
      }
    }
  }

  return { session, user, permissions: permsList, groups: groupsList };
}

/**
 * Non-redirecting variant: returns `null` if no session or if requirements fail,
 * otherwise the full session bundle (including optional user + rbac snapshot).
 */
export async function getFullSession(
  auth: HoleauthInstance,
  opts: Omit<ValidateRequestOptions, 'redirectTo' | 'throwOnFail'> = {},
): Promise<ValidatedRequest | null> {
  try {
    return await validateCurrentRequest(auth, { ...opts, throwOnFail: true });
  } catch {
    return null;
  }
}
