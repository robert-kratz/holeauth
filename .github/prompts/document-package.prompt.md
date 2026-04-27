---
name: Document Package
description: "Generates complete Fumadocs MDX documentation for one @holeauth/* package — package reference page, Getting Started sub-page, API reference entries, and navigation wiring."
---

# Document Package

Document the `@holeauth/${input:package:Which @holeauth package? (e.g. plugin-2fa, core, plugin-passkey, rbac-yaml)}` package fully.

## What to produce

1. **Read sources first** — inspect these paths before writing anything:
   - `packages/${input:package}/package.json` — name, version, exports map, peer deps
   - `packages/${input:package}/src/index.ts` (and every re-exported file) — collect every exported symbol
   - `packages/${input:package}/tsup.config.ts` — confirm entry points
   - `packages/${input:package}/test/*.test.ts` (if exists) — mine for real usage examples
   - `apps/playground/**` — look for end-to-end integration patterns

2. **Build an exhaustive symbol inventory** — list every export with its kind (function / type / class / constant). This inventory must appear in your plan before you write a single MDX line.

3. **Create or update these files** (check if they already exist first):
   - `apps/docs/content/docs/packages/${input:package}.mdx` — full package reference page
   - `apps/docs/content/docs/getting-started/${input:package}.mdx` — focused getting-started walk-through
   - `apps/docs/content/docs/api/${input:package}.mdx` — flat API reference (one H3 per symbol)
   - Update `apps/docs/content/docs/packages/meta.json` — add page if missing
   - Update `apps/docs/content/docs/getting-started/meta.json` — add page if missing
   - Update `apps/docs/content/docs/api/meta.json` — add page if missing

4. **For each exported symbol**, include all six required elements:
   - Exact signature (ts code block, copied from source)
   - TypeTable for parameters
   - TypeTable for return shape (or typed code block for scalars)
   - Runnable example with `title="..."` (all imports included, no truncation)
   - Throws section listing all `HoleauthError` subclasses the function can raise
   - See also cross-links

5. **Wire interactive demo** (if the package has a user-visible flow like TOTP, passkey, RBAC):
   - Create `apps/docs/components/demos/${input:package}-demo.tsx` (`'use client'`, seed data only)
   - Import and render it in the package reference page

## Output format

Reply with:
1. **Symbol inventory** — exhaustive list of what you found in source
2. **Plan** — todo list (one item per file to create/edit)  
3. **Gaps** — any symbol or behavior you could not verify in source (make assumptions explicit)
4. Then proceed to write each file, marking todos as you go
