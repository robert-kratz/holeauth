# holeauth

> Modular, edge-native auth ecosystem for modern TypeScript apps.

- `@holeauth/core` — JWT (jose), sessions, password, TOTP/OTP, OIDC, adapter interfaces
- `@holeauth/nextjs` — Next.js App Router handlers + middleware
- `@holeauth/react` — client provider + hooks
- `@holeauth/adapter-drizzle` — core Drizzle adapter (users/sessions/accounts/audit/verification)

## Dev

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter playground dev   # http://localhost:3000
pnpm --filter docs dev         # http://localhost:3001
```

## Publishing

1. `pnpm changeset` to describe your change
2. Commit + open PR
3. On merge to `main`, the Release workflow opens a version-PR; merging it publishes to npm

## License

MIT © Robert Kratz
