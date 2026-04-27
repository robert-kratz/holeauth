import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defaultRbacCache } from '../src/cache.js';

describe('defaultRbacCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  it('returns undefined on miss', () => {
    const c = defaultRbacCache(1000);
    expect(c.get('u')).toBeUndefined();
  });

  it('stores and returns a value inside the TTL', () => {
    const c = defaultRbacCache(1000);
    c.set('u', ['a', 'b']);
    expect(c.get('u')).toEqual(['a', 'b']);
  });

  it('returns undefined once the TTL has elapsed', () => {
    const c = defaultRbacCache(500);
    c.set('u', ['a']);
    vi.advanceTimersByTime(600);
    expect(c.get('u')).toBeUndefined();
  });

  it('invalidate drops a single entry', () => {
    const c = defaultRbacCache(60_000);
    c.set('u', ['a']);
    c.set('v', ['b']);
    c.invalidate('u');
    expect(c.get('u')).toBeUndefined();
    expect(c.get('v')).toEqual(['b']);
  });

  it('clear drops everything', () => {
    const c = defaultRbacCache(60_000);
    c.set('u', ['a']);
    c.set('v', ['b']);
    c.clear();
    expect(c.get('u')).toBeUndefined();
    expect(c.get('v')).toBeUndefined();
  });
});
