module.exports = function () {
  throw new Error(
    '@holeauth/trpc is ESM-only. Use `import` instead of `require`.\n' +
      'If you are using TypeScript, set `"moduleResolution": "bundler"` or `"node16"` in tsconfig.json.',
  );
};
