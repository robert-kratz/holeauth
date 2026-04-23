import { describe, expect, it } from 'vitest';
import { can, canAll, canAny, matchPattern, isNegation } from '../src/matcher.js';

describe('matchPattern', () => {
  it('"*" matches everything', () => {
    expect(matchPattern('*', 'anything')).toBe(true);
    expect(matchPattern('*', 'users.edit.delete')).toBe(true);
  });

  it('exact matches require full equality', () => {
    expect(matchPattern('users.edit', 'users.edit')).toBe(true);
    expect(matchPattern('users.edit', 'users.edit.delete')).toBe(false);
    expect(matchPattern('users.edit', 'users')).toBe(false);
  });

  it('trailing .* matches node and its descendants', () => {
    expect(matchPattern('users.edit.*', 'users.edit')).toBe(true);
    expect(matchPattern('users.edit.*', 'users.edit.delete')).toBe(true);
    expect(matchPattern('users.edit.*', 'users.edit.meta.flag')).toBe(true);
    expect(matchPattern('users.edit.*', 'users')).toBe(false);
    expect(matchPattern('users.edit.*', 'users.editor')).toBe(false);
  });
});

describe('can()', () => {
  it('returns false when no grant matches', () => {
    expect(can(['posts.read'], 'users.edit')).toBe(false);
  });

  it('grants match by exact', () => {
    expect(can(['users.edit'], 'users.edit')).toBe(true);
  });

  it('root wildcard grants everything', () => {
    expect(can(['*'], 'users.edit.delete')).toBe(true);
  });

  it('negation overrides a positive grant', () => {
    expect(can(['*', '!users.edit.delete'], 'users.edit.delete')).toBe(false);
    expect(can(['*', '!users.edit.delete'], 'users.edit')).toBe(true);
  });

  it('subtree negation blocks entire branch', () => {
    expect(can(['*', '!admin.*'], 'admin')).toBe(false);
    expect(can(['*', '!admin.*'], 'admin.tools')).toBe(false);
    expect(can(['*', '!admin.*'], 'users.edit')).toBe(true);
  });

  it('order does not matter — negations always win', () => {
    expect(can(['!users.edit', 'users.edit'], 'users.edit')).toBe(false);
    expect(can(['users.edit', '!users.edit'], 'users.edit')).toBe(false);
  });

  it('isNegation helper', () => {
    expect(isNegation('!foo')).toBe(true);
    expect(isNegation('foo')).toBe(false);
  });
});

describe('canAll / canAny', () => {
  it('canAll requires every node to pass', () => {
    expect(canAll(['users.*'], ['users.read', 'users.edit'])).toBe(true);
    expect(canAll(['users.*', '!users.edit'], ['users.read', 'users.edit'])).toBe(false);
  });
  it('canAny requires one node to pass', () => {
    expect(canAny(['posts.read'], ['users.read', 'posts.read'])).toBe(true);
    expect(canAny(['nope'], ['users.read', 'posts.read'])).toBe(false);
  });
});
