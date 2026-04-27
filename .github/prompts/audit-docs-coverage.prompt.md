---
name: Audit Docs Coverage
description: "Compares every exported symbol across all @holeauth/* packages against existing MDX pages and reports gaps — missing pages, missing symbols, stale type signatures, broken cross-links."
---

# Audit Docs Coverage

Perform a full coverage audit of the holeauth documentation.

## Steps

### 1. Collect all exports (source of truth)

For each package under `packages/` (except `tsconfig`, `eslint-config`):
- Read `packages/<pkg>/src/index.ts` and every file it re-exports
- Read `packages/<pkg>/tsup.config.ts` for subpath entry points
- Build a table: `{ package, subpath, symbol, kind }`

### 2. Collect all documented symbols

Scan every `.mdx` file under `apps/docs/content/docs/`:
- Extract H2/H3 headings that correspond to symbol names
- Extract code block titles and signatures

### 3. Produce a gap report

For each package, output a markdown table:

| Symbol | Kind | Source path | Documented? | Notes |
| --- | --- | --- | --- | --- |
| `defineHoleauth` | function | core/src/index.ts | ✅ | — |
| `rotateRefresh` | function | core/src/session.ts | ❌ | Missing from core.mdx |
| `RbacPlugin` | type | plugin-rbac/src/index.ts | ⚠️ | Signature outdated |

Legend: ✅ complete, ⚠️ present but incomplete/stale, ❌ missing entirely

### 4. Check navigation wiring

For every `.mdx` file under `apps/docs/content/docs/`, verify it is listed in its parent `meta.json`. Report any orphan pages.

### 5. Check cross-links

Scan all MDX for `href="/docs/..."` and verify the target file exists.

### 6. Prioritised fix list

Output a prioritised action list grouped by severity:
- **P0** — Missing pages for packages that exist in source
- **P1** — Missing symbols on existing pages  
- **P2** — Stale signatures (type no longer matches source)
- **P3** — Broken cross-links or orphan pages

Do **not** fix anything during this prompt — only report. Use the `document-package` prompt or the Holeauth Docs Writer agent to action each item.
