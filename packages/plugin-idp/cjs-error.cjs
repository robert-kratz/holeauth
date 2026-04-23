// Shim loaded when a CommonJS consumer does `require('@holeauth/plugin-idp')`.
// All @holeauth/* packages are ESM-only.
throw new Error(
  '[@holeauth] This package is ESM-only. ' +
    'Use `import` (or a dynamic `import()`) instead of `require()`. ' +
    'If you are in a CommonJS project, add `"type": "module"` to your package.json ' +
    'or migrate the consuming file to `.mjs`.',
);
