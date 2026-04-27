---
name: Rebuild Docs IA
description: "Migrates the existing flat apps/docs/content/docs structure to the Next.js-style hierarchy (getting-started/, concepts/, guides/, packages/, api/) — moves files, creates sub-folder meta.json, rewrites cross-links."
---

# Rebuild Docs Information Architecture

Migrate `apps/docs/content/docs` from the current flat structure to the Next.js-style hierarchy agreed on for this project.

## Target structure

```
content/docs/
  index.mdx
  getting-started.mdx          # 5-minute Next.js walk-through (entry point)
  meta.json                    # top-level nav
  getting-started/
    meta.json
    core.mdx
    nextjs.mdx
    react.mdx
    adapter-drizzle.mdx
    plugin-2fa.mdx
    plugin-passkey.mdx
    plugin-rbac.mdx
    plugin-idp.mdx
  concepts/
    meta.json
    index.mdx
    sessions.mdx
    csrf.mdx
    adapter-contract.mdx
    plugin-contract.mdx
    events-audit.mdx
    security-model.mdx
  guides/
    meta.json
    index.mdx
    email-password.mdx
    two-factor.mdx
    passkeys.mdx
    sso.mdx
    rbac.mdx
    sessions-refresh.mdx
    audit-logging.mdx
    account-linking.mdx
    password-reset.mdx
  packages/
    meta.json
    index.mdx
    core.mdx
    nextjs.mdx
    react.mdx
    adapter-drizzle.mdx
    2fa-drizzle.mdx
    passkey-drizzle.mdx
    rbac-drizzle.mdx
    idp-drizzle.mdx
    rbac-yaml.mdx
    plugin-2fa.mdx
    plugin-passkey.mdx
    plugin-rbac.mdx
    plugin-idp.mdx
  api/
    meta.json
    index.mdx
    core/
      meta.json
      index.mdx
      jwt.mdx
      session.mdx
      flows.mdx
      password.mdx
      totp.mdx
      otp.mdx
      cookies.mdx
      events.mdx
      passkey.mdx
      sso.mdx
      adapters.mdx
      errors.mdx
    nextjs.mdx
    react.mdx
    plugins/
      meta.json
      2fa.mdx
      passkey.mdx
      rbac.mdx
      idp.mdx
  configuration.mdx
```

## Steps

### 1. Plan (do not touch files yet)

- List every existing file and where it maps in the new tree
- Identify files that need to be split (e.g. existing `guides/passkeys.mdx` → keep path, just move to `guides/`)
- Identify files that are new stubs (to be written later by `document-package`)
- Output the plan as a two-column table: `Old path | New path | Action (move/keep/new stub/delete)`

### 2. Get approval

Stop after the plan and ask: "Shall I proceed with this migration?"

### 3. Execute (only after approval)

- Move existing `.mdx` files to new paths (copy content, then replace old file with a redirect comment or delete)
- Create sub-folder `meta.json` files
- Update top-level `meta.json`
- Fix all internal `href="/docs/..."` cross-links to match new paths
- Create empty stub pages (frontmatter only) for pages that are new

### 4. Verify

After migration, list all new files and confirm each appears in a `meta.json`. Report any file that has no navigation entry.

## Constraints

- Do NOT rewrite or expand content during migration — only move and update paths
- Do NOT change the content of existing pages beyond fixing cross-links
- Stub pages get frontmatter only — no content yet (to be filled by `document-package`)
