---
name: integrate-holeauth
description: "Integrate holeauth into a project from scratch. Use when: adding authentication, setting up auth, integrating holeauth, installing holeauth, adding login, adding 2FA, adding passkeys, adding RBAC, adding SSO, adding sessions. Asks what features are needed and loads the right per-package skills."
argument-hint: "Describe your project (framework, DB, desired auth features)"
---

# Integrate holeauth

This skill is the **entry point** for adding holeauth to any project. It interviews you about your stack and goals, then loads the appropriate per-package skills for your exact setup.

## Procedure

### Step 1 — Interview

Use the `vscode/askQuestions` tool to ask the following questions before doing anything else:

**Questions to ask:**

1. **Framework** — Which framework are you using?
   - Options: Next.js (App Router), Next.js (Pages Router), Express / Fastify (Node), Other
   - *Currently only Next.js (App Router) has first-class support via `@holeauth/nextjs`.*

2. **Database** — Which database / ORM are you using?
   - Options: PostgreSQL + Drizzle, MySQL + Drizzle, SQLite + Drizzle, Other / Bring your own adapter

3. **Auth features** — Which features do you need? (multi-select)
   - Options: Core (email + password), Two-Factor Authentication (TOTP), Passkeys (WebAuthn), RBAC (roles & permissions), SSO / OAuth (IDP)

4. **User table** — Do you already have a users table in your project?
   - Options: Yes — I have an existing users table, No — start from scratch

### Step 2 — Route to the right skills

Based on the answers above, tell the user which skills to invoke and load them yourself if they are in scope:

| Selected feature | Skill to load |
|---|---|
| Any (always required) | `integrate-holeauth-core` |
| Two-Factor Authentication | `integrate-holeauth-2fa` |
| Passkeys | `integrate-holeauth-passkey` |
| RBAC | `integrate-holeauth-rbac` |
| SSO / OAuth | `integrate-holeauth-idp` |

Load each relevant skill's `SKILL.md` via `read_file` from `.github/skills/<skill-name>/SKILL.md` and follow its procedure.

### Step 3 — Summarize

After all skills complete, generate a checklist of everything that was installed and configured so the user can verify their setup.

## Scope

- Covers Next.js (App Router) as the primary target.
- Other Node frameworks: the core + adapter steps apply; route handler wiring differs.
- Does **not** cover email delivery or custom UI design.
