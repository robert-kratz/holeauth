---
applyTo: "apps/docs/content/**/*.mdx"
description: "MDX authoring conventions for holeauth's Fumadocs documentation. Apply to every .mdx file under apps/docs/content/."
---

# Fumadocs MDX Conventions — holeauth docs

## Frontmatter (required on every page)

```yaml
---
title: <Sentence case, ≤60 chars>
description: <One sentence shown in search and Open Graph, ≤160 chars>
---
```

Never add extra frontmatter fields (`icon`, `full`, `toc`) unless explicitly requested.

## Imports

Place all Fumadocs component imports at the very top of the file, before any prose:

```tsx
import { Callout } from 'fumadocs-ui/components/callout';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import { Cards, Card } from 'fumadocs-ui/components/card';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
```

Only import what the page actually uses.

## Code Blocks

- Always declare language: `ts`, `tsx`, `bash`, `sql`, `yaml`, `json`.
- Add `title="path/to/file.ts"` for all multi-file examples.
- Highlight changed lines: `{3,7-9}`.
- Use diff annotations for before/after: `// [!code ++]` / `// [!code --]`.
- Never truncate with `// ...` or `/* ... */` — every example must be runnable as-is.
- All imports must be at the top of every code block.

```ts title="lib/auth.ts" {4-6}
import { defineHoleauth } from '@holeauth/core';
import { drizzleAdapter } from '@holeauth/adapter-drizzle/pg';
import { db } from '@/db';

export const auth = defineHoleauth({
  adapter: drizzleAdapter(db),
  secrets: { jwtSecret: process.env.HOLEAUTH_SECRET! },
});
```

## Install Tabs (standard pattern)

Always use the four-tab install snippet:

```tsx
<Tabs items={['pnpm', 'npm', 'yarn', 'bun']}>
  <Tab value="pnpm">```bash pnpm add @holeauth/core ```</Tab>
  <Tab value="npm">```bash npm install @holeauth/core ```</Tab>
  <Tab value="yarn">```bash yarn add @holeauth/core ```</Tab>
  <Tab value="bun">```bash bun add @holeauth/core ```</Tab>
</Tabs>
```

## Callouts

| Type | When to use |
| --- | --- |
| `info` | Tips, background knowledge, non-obvious behavior |
| `warn` | Security risks, deprecated patterns, gotchas |
| `error` | Things that will break at runtime if you do them |

```tsx
<Callout type="warn">
  Recovery codes are single-use. Store them hashed, never in plain text.
</Callout>
```

## TypeTable

Use `<TypeTable>` for every config object, every function parameter set, every return shape:

```tsx
<TypeTable
  type={{
    jwtSecret: {
      description: 'Secret used to sign access and refresh JWTs. Must be ≥32 chars.',
      type: 'string',
      required: true,
    },
    basePath: {
      description: 'Prefix for all auth routes.',
      type: 'string',
      default: '"/api/auth"',
    },
  }}
/>
```

## Steps (Getting Started pages)

Wrap step-by-step walkthroughs in `<Steps>`:

```tsx
<Steps>
  <Step>
    ### Install packages
    ...
  </Step>
  <Step>
    ### Create the auth instance
    ...
  </Step>
</Steps>
```

Each `<Step>` heading uses `###` (H3). Keep steps focused: one meaningful action each.

## API Reference structure (package pages)

Order within a package reference page:

1. H1 package name with one-line description
2. Install Tabs
3. "Quick example" — minimal runnable snippet
4. One H2 per subpath export (`## @holeauth/core/session`, etc.)
5. One H3 per exported symbol, with: signature code block → TypeTable params → TypeTable return → example → throws → See also
6. "See also" Cards at the bottom

## Cross-linking

- Always link symbol names on first mention: `[\`defineHoleauth\`](/docs/packages/core#defineholeauth)`.
- Link concept mentions: sessions → `/docs/concepts/sessions`, CSRF → `/docs/concepts/csrf`.
- No orphan pages — every new page must be listed in the nearest `meta.json`.

## Navigation (meta.json)

Add every new page to the section's `meta.json`. Use separator labels for grouped sections:

```json
{
  "title": "Packages",
  "pages": [
    "index",
    "core",
    "nextjs",
    "react",
    "---Drizzle Adapters---",
    "adapter-drizzle",
    "2fa-drizzle",
    "passkey-drizzle",
    "rbac-drizzle",
    "idp-drizzle",
    "---Plugins---",
    "plugin-2fa",
    "plugin-passkey",
    "plugin-rbac",
    "plugin-idp",
    "---Utilities---",
    "rbac-yaml"
  ]
}
```

## Interactive Demo Components

Small client demos live under `apps/docs/components/demos/<name>.tsx`:

- Must start with `'use client';`
- No server-side dependencies (no DB, no env vars)
- Seed data only — never real secrets or real network calls
- Import into MDX: `import { TotpDemo } from '@/components/demos/totp-demo';`

## Things to never do

- Do not use `<img>` — use Next.js `<Image>` or omit images.
- Do not use H1 (`#`) more than once per page.
- Do not fabricate type signatures — verify every symbol in `packages/*/src` before writing.
- Do not write `// ...` or `/* rest omitted */` in code blocks.
- Do not add frontmatter fields not listed above.
- Do not create pages without updating `meta.json`.
