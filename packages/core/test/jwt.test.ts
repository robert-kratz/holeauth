import { describe, it, expect } from 'vitest';
import { sign, verify } from '../src/jwt/index.js';

describe('jwt', () => {
  it('signs and verifies a round-trip HS256 token', async () => {
    const secret = 'test-secret-please-change';
    const token = await sign({ hello: 'world' }, secret, { expiresIn: '1m' });
    const payload = await verify<{ hello: string }>(token, secret);
    expect(payload.hello).toBe('world');
  });
});
