import type {
  CreateAppInput,
  CreateAuthorizationCodeInput,
  CreateRefreshTokenInput,
  CreateSigningKeyInput,
  IdpApp,
  IdpAuthorizationCode,
  IdpConsent,
  IdpRefreshToken,
  IdpSigningKey,
  IdpTeam,
  IdpTeamMember,
  TeamRole,
  UpdateAppInput,
} from './types.js';

/**
 * Storage contract for @holeauth/plugin-idp.
 *
 * Grouped by domain. Implementations (drizzle, in-memory, …) must satisfy
 * the full surface.
 */
export interface IdpAdapter {
  teams: {
    create(input: { name: string; ownerUserId: string }): Promise<IdpTeam>;
    getById(teamId: string): Promise<IdpTeam | null>;
    delete(teamId: string): Promise<void>;
    listForUser(userId: string): Promise<Array<IdpTeam & { role: TeamRole }>>;
    listMembers(teamId: string): Promise<IdpTeamMember[]>;
    getMembership(teamId: string, userId: string): Promise<IdpTeamMember | null>;
    addMember(teamId: string, userId: string, role: TeamRole): Promise<void>;
    removeMember(teamId: string, userId: string): Promise<void>;
  };

  apps: {
    create(input: CreateAppInput): Promise<IdpApp>;
    getById(appId: string): Promise<IdpApp | null>;
    listAll(opts?: { limit?: number }): Promise<IdpApp[]>;
    listForTeam(teamId: string): Promise<IdpApp[]>;
    listForUser(userId: string): Promise<IdpApp[]>;
    update(appId: string, patch: UpdateAppInput): Promise<IdpApp>;
    delete(appId: string): Promise<void>;
  };

  codes: {
    create(input: CreateAuthorizationCodeInput): Promise<void>;
    /**
     * Atomically mark an authorization code consumed and return it
     * if and only if it existed, was not yet consumed, and had not
     * yet expired. Returns null otherwise.
     */
    consume(codeHash: string): Promise<IdpAuthorizationCode | null>;
  };

  refresh: {
    create(input: CreateRefreshTokenInput): Promise<IdpRefreshToken>;
    getByHash(hash: string): Promise<IdpRefreshToken | null>;
    markRevoked(id: string): Promise<void>;
    revokeFamily(familyId: string): Promise<void>;
    revokeAllForUser(userId: string): Promise<void>;
    revokeAllForApp(appId: string): Promise<void>;
    listForApp(appId: string): Promise<IdpRefreshToken[]>;
  };

  consent: {
    get(userId: string, appId: string): Promise<IdpConsent | null>;
    upsert(userId: string, appId: string, scopesGranted: string[]): Promise<void>;
    revoke(userId: string, appId: string): Promise<void>;
  };

  keys: {
    listActive(): Promise<IdpSigningKey[]>;
    getActive(): Promise<IdpSigningKey | null>;
    create(input: CreateSigningKeyInput): Promise<IdpSigningKey>;
    markRotated(kid: string): Promise<void>;
  };
}
