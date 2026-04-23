import { describe, it, expect } from 'vitest';
import { hash, verify } from '../src/password/index.js';

describe('password', () => {
  it('hashes and verifies (pbkdf2 fallback is always present)', async () => {
    const h = await hash('correct horse battery staple');
    expect(h.length).toBeGreaterThan(20);
    expect(await verify('correct horse battery staple', h)).toBe(true);
    expect(await verify('wrong password', h)).toBe(false);
  });
});
