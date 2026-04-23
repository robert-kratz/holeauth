#!/usr/bin/env node
// Convert each package to ESM-only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const packages = ['core', 'nextjs', 'react', 'plugin-rbac', 'plugin-2fa', 'plugin-passkey', 'adapter-drizzle'];

for (const pkg of packages) {
  const pkgPath = resolve('packages', pkg, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const raw = readFileSync(pkgPath, 'utf8');
  const j = JSON.parse(raw);
  delete j.main;
  delete j.module;

  // Rewrite exports: for each subpath, keep `types` + `import`, set `require` to the shared cjs-error shim.
  if (j.exports) {
    const newExports = {};
    for (const [key, val] of Object.entries(j.exports)) {
      if (key === './package.json') {
        newExports[key] = val;
        continue;
      }
      if (typeof val === 'string') {
        newExports[key] = val;
        continue;
      }
      const { types, import: imp } = val;
      newExports[key] = {
        ...(types ? { types } : {}),
        ...(imp ? { import: imp } : {}),
        require: './cjs-error.cjs',
      };
    }
    j.exports = newExports;
  }

  // Ensure files includes cjs-error.cjs
  if (Array.isArray(j.files) && !j.files.includes('cjs-error.cjs')) {
    j.files.push('cjs-error.cjs');
  }

  // Normalise trailing newline + 2-space indentation.
  writeFileSync(pkgPath, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('updated', pkgPath);
}
