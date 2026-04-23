import { describe, expect, it } from 'vitest';
import type { HoleauthConfig } from '../src/types/index.js';
import { definePlugin } from '../src/plugins/define.js';
import { buildRegistry } from '../src/plugins/registry.js';

function emptyCfg(): HoleauthConfig {
  return {
    secrets: { jwtSecret: 'x'.repeat(32) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adapters: {} as any,
  };
}

describe('plugin registry — topo sort', () => {
  it('sorts by dependsOn', () => {
    const calls: string[] = [];
    const a = definePlugin({ id: 'a', api: () => { calls.push('a'); return {}; } });
    const b = definePlugin({ id: 'b', dependsOn: ['a'], api: () => { calls.push('b'); return {}; } });
    const c = definePlugin({ id: 'c', dependsOn: ['b'], api: () => { calls.push('c'); return {}; } });
    buildRegistry(emptyCfg(), [c, a, b]);
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('throws on duplicate ids', () => {
    const a = definePlugin({ id: 'dup', api: () => ({}) });
    const b = definePlugin({ id: 'dup', api: () => ({}) });
    expect(() => buildRegistry(emptyCfg(), [a, b])).toThrow(/duplicate plugin id/);
  });

  it('throws on missing dependency', () => {
    const a = definePlugin({ id: 'a', dependsOn: ['missing'], api: () => ({}) });
    expect(() => buildRegistry(emptyCfg(), [a])).toThrow(/missing plugin "missing"/);
  });

  it('throws on dependsOn cycle', () => {
    const a = definePlugin({ id: 'a', dependsOn: ['b'], api: () => ({}) });
    const b = definePlugin({ id: 'b', dependsOn: ['a'], api: () => ({}) });
    expect(() => buildRegistry(emptyCfg(), [a, b])).toThrow(/cycle/);
  });
});

describe('plugin registry — routes', () => {
  it('collects plugin routes', () => {
    const a = definePlugin({
      id: 'p1',
      api: () => ({}),
      routes: [{ method: 'POST', path: '/p1/foo', handler: () => new Response('') }],
    });
    const reg = buildRegistry(emptyCfg(), [a]);
    expect(reg.routes.length).toBe(1);
    expect(reg.routes[0]!.path).toBe('/p1/foo');
  });

  it('rejects collision with core routes', () => {
    const a = definePlugin({
      id: 'p1',
      api: () => ({}),
      routes: [{ method: 'POST', path: '/signin', handler: () => new Response('') }],
    });
    expect(() => buildRegistry(emptyCfg(), [a])).toThrow(/signin/);
  });

  it('rejects collisions between plugins', () => {
    const a = definePlugin({
      id: 'a', api: () => ({}),
      routes: [{ method: 'POST', path: '/same', handler: () => new Response('') }],
    });
    const b = definePlugin({
      id: 'b', api: () => ({}),
      routes: [{ method: 'POST', path: '/same', handler: () => new Response('') }],
    });
    expect(() => buildRegistry(emptyCfg(), [a, b])).toThrow();
  });
});

describe('plugin registry — api access', () => {
  it('getPlugin<T>(id) returns the typed api', () => {
    const a = definePlugin({ id: 'a', api: () => ({ hello: () => 42 }) });
    const reg = buildRegistry(emptyCfg(), [a]);
    const api = reg.ctx.getPlugin<{ hello: () => number }>('a');
    expect(api.hello()).toBe(42);
  });

  it('getPlugin throws on unknown id', () => {
    const reg = buildRegistry(emptyCfg(), []);
    expect(() => reg.ctx.getPlugin('missing')).toThrow(/not registered/);
  });
});
