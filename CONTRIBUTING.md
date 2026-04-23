# Contributing

1. Fork & clone; `pnpm install` (Node 20, pnpm 9).
2. Create a branch off `main`.
3. Make changes; run `pnpm lint typecheck test build`.
4. Run `pnpm changeset` and describe the change (patch/minor/major).
5. Commit, push, open a PR against `main`.

## Monorepo layout

- `packages/*` — publishable libraries
- `apps/*` — private (docs, playground)

## Scripts

- `pnpm build` — build all packages
- `pnpm dev` — run all dev servers in parallel
- `pnpm test` — run Vitest across all packages
