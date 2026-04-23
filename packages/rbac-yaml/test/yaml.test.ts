import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateRbacDefinition, loadRbacYaml } from '../src/index.js';

const validDef = {
  groups: {
    user: { default: true, permissions: ['profile.read'] },
    admin: { inherits: ['user'], priority: 100, permissions: ['*', '!admin.delete'] },
  },
};

describe('validateRbacDefinition', () => {
  it('accepts a valid definition and resolves inheritance', () => {
    const snap = validateRbacDefinition(validDef);
    expect(snap.groups.map((g) => g.id).sort()).toEqual(['admin', 'user']);
    const admin = snap.groups.find((g) => g.id === 'admin')!;
    expect(admin.effective).toContain('profile.read');
    expect(admin.effective).toContain('*');
    expect(snap.defaultGroupId).toBe('user');
  });

  it('rejects missing default group', () => {
    expect(() =>
      validateRbacDefinition({ groups: { foo: { permissions: [] } } }),
    ).toThrow();
  });

  it('allows multiple default groups by picking the first (current behaviour)', () => {
    const snap = validateRbacDefinition({
      groups: {
        a: { default: true, permissions: [] },
        b: { default: true, permissions: [] },
      },
    });
    expect(['a', 'b']).toContain(snap.defaultGroupId);
  });

  it('rejects invalid permission strings', () => {
    expect(() =>
      validateRbacDefinition({
        groups: { user: { default: true, permissions: ['not valid spaces'] } },
      }),
    ).toThrow();
  });

  it('rejects unknown inherits references', () => {
    expect(() =>
      validateRbacDefinition({
        groups: {
          user: { default: true, permissions: [] },
          admin: { inherits: ['ghost'], permissions: [] },
        },
      }),
    ).toThrow();
  });
});

describe('loadRbacYaml', () => {
  it('reads and parses a YAML file from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rbac-yaml-'));
    const file = join(dir, 'rbac.yml');
    writeFileSync(
      file,
      `groups:\n  user:\n    default: true\n    permissions:\n      - profile.read\n`,
    );
    try {
      const loaded = loadRbacYaml(file);
      expect(loaded.snapshot.defaultGroupId).toBe('user');
      loaded.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
