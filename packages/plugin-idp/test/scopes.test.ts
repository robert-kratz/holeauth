/**
 * Tests for scope helpers + claim mapping.
 */
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_SCOPES,
  parseScope,
  formatScope,
  intersectScopes,
  claimsForUser,
} from '../src/scopes.js';
import type { AdapterUser } from '@holeauth/core/adapters';

describe('BUILTIN_SCOPES', () => {
  it('contains the standard OIDC scopes', () => {
    expect(BUILTIN_SCOPES).toEqual(['openid', 'profile', 'email', 'offline_access']);
  });
});

describe('parseScope', () => {
  it('returns [] for null/undefined/empty', () => {
    expect(parseScope(null)).toEqual([]);
    expect(parseScope(undefined)).toEqual([]);
    expect(parseScope('')).toEqual([]);
  });

  it('splits on whitespace and filters empties', () => {
    expect(parseScope('openid  profile\temail')).toEqual(['openid', 'profile', 'email']);
  });
});

describe('formatScope', () => {
  it('joins with spaces and deduplicates', () => {
    expect(formatScope(['openid', 'profile', 'openid'])).toBe('openid profile');
  });
});

describe('intersectScopes', () => {
  it('keeps only requested scopes also in the allowed set', () => {
    expect(intersectScopes(['openid', 'admin'], ['openid', 'profile'])).toEqual(['openid']);
  });
});

describe('claimsForUser', () => {
  const user: AdapterUser = {
    id: 'u1',
    name: 'Alice',
    email: 'a@example.com',
    image: 'https://img',
    emailVerified: new Date(),
  } as unknown as AdapterUser;

  it('adds name/preferred_username/picture for profile scope', () => {
    const c = claimsForUser(user, ['profile']);
    expect(c.name).toBe('Alice');
    expect(c.preferred_username).toBe('Alice');
    expect(c.picture).toBe('https://img');
  });

  it('omits optional profile claims when the user lacks them', () => {
    const u2 = { ...user, name: null, image: null } as unknown as AdapterUser;
    const c = claimsForUser(u2, ['profile']);
    expect(c.name).toBeUndefined();
    expect(c.picture).toBeUndefined();
  });

  it('adds email + email_verified=true when emailVerified is set', () => {
    const c = claimsForUser(user, ['email']);
    expect(c.email).toBe('a@example.com');
    expect(c.email_verified).toBe(true);
  });

  it('email_verified=false when emailVerified is null', () => {
    const u2 = { ...user, emailVerified: null } as unknown as AdapterUser;
    const c = claimsForUser(u2, ['email']);
    expect(c.email_verified).toBe(false);
  });

  it('returns empty object when no relevant scopes are granted', () => {
    expect(claimsForUser(user, ['openid'])).toEqual({});
  });
});
