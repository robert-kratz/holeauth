---
name: holeauth-versioning
description: "Manage all versioning and release operations for the holeauth monorepo using Changesets. Use when: adding a changeset, bumping versions, releasing packages, publishing to npm, switching between pre-release and stable mode, triggering a snapshot, recovering from a broken version state, version packages, release alpha, release stable, changeset add, create changeset, broken release, wrong version published, unpublish, fix pre.json, pre-release mode, enter alpha, exit alpha."
argument-hint: "Optional: list of changed packages and bump type (patch/minor/major)"
---

# holeauth Versioning & Release Management

All releases flow **exclusively through CI** — the GitHub Actions workflows in `.github/workflows/` are the only authorised publish path. Never run `changeset publish` or `npm publish` locally.

## Concepts Glossary

| Term | What it is |
|---|---|
| **Changeset file** | A `.changeset/<name>.md` file expressing *intent* — which packages changed and at what bump level. It is NOT a version bump itself. Consumed exactly once by `changeset version`. |
| **`pre.json`** | Tracks pre-release state. Managed by `changeset pre enter/exit`. **Never edit `initialVersions` manually** unless following the Broken-State Recovery procedure. |
| **`fixed` group** | Packages listed together in `config.json → fixed` always bump to the **same version**, set by the **highest** bump type across all changesets in the batch. One `major` changeset → all fixed-group packages go to major. |
| **dist-tags** | `latest` = current stable; `alpha` = pre-release (set by `pre.json`); `pr-N` = one-off snapshot from a PR branch. |
| **"Version Packages" PR** | PR automatically opened by `changesets/action` on `main` when unconsumed changesets exist. Merging this PR is what triggers the publish. |

---

## Workflow A — Add a Changeset (daily operation)

### When to use
Every PR that changes user-facing behaviour in a published package needs a changeset. CI will block the PR if changesets are required but missing (if enforced).

### Step 1 — Create the file

Create `.changeset/<kebab-description>.md`. Name the file after the **change**, not the package (e.g. `cookie-pending-flow.md`, not `core-update.md`).

```md
---
"@holeauth/core": patch
"@holeauth/react": patch
---

Brief imperative description of what changed (shown in CHANGELOG).
```

### Step 2 — Choose the bump type

| Type | When |
|---|---|
| `patch` | Bug fix, docs, internal refactor — no API change |
| `minor` | New public feature, backward-compatible API addition |
| `major` | Breaking change — removed/renamed API, changed behaviour |

### Step 3 — Fixed-group awareness

The `fixed` group in `.changeset/config.json` currently contains 13 core packages:

```
@holeauth/core, @holeauth/adapter-drizzle, @holeauth/nextjs-app-router,
@holeauth/react, @holeauth/plugin-2fa, @holeauth/plugin-rbac,
@holeauth/plugin-passkey, @holeauth/plugin-idp, @holeauth/2fa-drizzle,
@holeauth/rbac-drizzle, @holeauth/passkey-drizzle, @holeauth/idp-drizzle,
@holeauth/rbac-yaml
```

**Rule:** If your changeset lists **any** of these packages at `minor`, all 13 will bump to the same minor version. Listing even one at `major` escalates all 13. Only list packages that actually changed; do not add uninvolved packages just to "signal" intent.

### Step 4 — Commit and push

Commit the `.changeset/*.md` file as part of your branch. No version numbers change at this point.

---

## Workflow B — Trigger a Release (CI only)

```
Developer merges PR with changeset(s)
        │
        ▼
  release.yml runs on main
        │
        ├── Unconsumed changesets exist?
        │         YES → opens / updates "Version Packages" PR
        │                 (bumps package.json versions + updates CHANGELOGs)
        │
        └── "Version Packages" PR was just merged?
                  YES → runs `pnpm release`
                           └── turbo build + changeset publish
                                    └── pushes to npm with correct dist-tag
```

**To release: merge the "Version Packages" PR.** That is the only action required.

- In pre-release mode (`pre.json` exists): versions render as `X.Y.Z-alpha.N`, published to `alpha` dist-tag
- In stable mode: versions render as `X.Y.Z`, published to `latest` dist-tag
- First-ever publish of a package: always goes to `latest` regardless of mode (npm has no prior `latest` for it)

### Required secrets (already configured in the repo)

| Secret | Purpose |
|---|---|
| `NPM_TOKEN` | Publish authentication |
| `GITHUB_TOKEN` | Auto-provided; opens PRs, creates tags |

The `release.yml` job has `id-token: write` for npm provenance attestation — this works only in GitHub Actions OIDC context.

---

## Workflow C — Snapshot Publish (from a PR)

Used to test an in-progress PR on a real npm install without releasing.

**Option 1 — Label the PR:** Add the label `snapshot` to any open PR. The `snapshot.yml` workflow triggers automatically.

**Option 2 — Manual dispatch:** Go to Actions → "Snapshot" → Run workflow → enter the PR number.

Result:
- Packages are versioned as `0.0.1-alpha-<timestamp>.0`
- Published to dist-tag `pr-<number>` (e.g. `pr-42`)
- A bot comment on the PR lists the install commands

```bash
# Install a snapshot in a consumer project
pnpm add @holeauth/core@pr-42
```

Snapshots are not persisted in `pre.json` or any changelog — they are throwaway versions.

---

## Workflow D — Enter / Exit Pre-Release Mode

### Enter pre-release (alpha)

```bash
pnpm changeset pre enter alpha
git add .changeset/pre.json
git commit -m "chore: enter alpha pre-release mode"
git push origin main
```

This creates `.changeset/pre.json`. All subsequent `changeset version` runs produce `X.Y.Z-alpha.N` versions.

### Exit pre-release (ship stable)

```bash
pnpm changeset pre exit
git add .changeset/pre.json
git commit -m "chore: exit pre-release mode"
git push origin main
```

This deletes `.changeset/pre.json`. The next "Version Packages" PR will produce clean `X.Y.Z` versions.

> **Important:** Always commit the `pre.json` change before creating or merging a PR. An uncommitted `pre.json` state causes `changeset version` to miscompute versions in CI.

---

## Workflow E — Broken-State Recovery

> Use this workflow only when versions have been published incorrectly or the local state diverges from npm.

### Step 1 — Diagnose

| Symptom | Likely cause |
|---|---|
| Published version is much higher than expected (e.g. `1.0.0` from a patch) | Stale changeset file with `major` bump + `fixed` group escalation |
| `changeset version` produces wrong bump | `pre.json → initialVersions` is out of sync with what is on npm |
| `changeset publish` fails with provenance error | `"provenance": true` in `publishConfig` of `package.json` — only works in CI |
| Version exists on npm but shouldn't | Need to `npm unpublish` within 72h window |

### Step 2 — Remove bad versions from npm (72h window)

```bash
# Unpublish a specific bad version
npm unpublish @holeauth/core@1.0.0-alpha.1 --force

# Check what's on npm
npm view @holeauth/core versions --json
```

If the 72h window has passed, contact npm support or publish a corrected patch version instead.

### Step 3 — Reset pre.json to correct state

1. Determine the **target baseline version** — what all packages should be at after the next release
2. Edit `.changeset/pre.json`:
   - Keep `"mode": "pre"` and `"tag": "alpha"`
   - Set `"changesets": []` (empty — all stale changeset files should be deleted)
   - Set **all** `initialVersions` to the **currently published** version for each package (i.e. the last correctly published version). This is the version before any bump.
3. Delete all stale `.changeset/*.md` files that caused the wrong bump

```json
{
  "mode": "pre",
  "tag": "alpha",
  "changesets": [],
  "initialVersions": {
    "@holeauth/core": "0.0.2-alpha.0",
    "@holeauth/react": "0.0.2-alpha.0"
  }
}
```

### Step 4 — Set package.json versions to match target

Manually set each `packages/*/package.json` `"version"` field to the target version:

```bash
# Script to set all packages to a specific version
for f in packages/*/package.json; do
  node -e "
    const fs = require('fs');
    const j = JSON.parse(fs.readFileSync('$f', 'utf8'));
    j.version = '0.0.3-alpha.0';  // ← target version
    fs.writeFileSync('$f', JSON.stringify(j, null, 2) + '\n');
    console.log('updated: $f');
  "
done
```

### Step 5 — Rebuild and push

```bash
pnpm run build
git add -A
git commit -m "chore: recover release state to X.Y.Z-alpha.N"
git push origin main
```

CI will detect no unconsumed changesets (since `changesets: []`) and will NOT open a "Version Packages" PR. The next changeset you add will produce the correct next version.

---

## Known Pitfalls

### 1. Fixed-group version escalation

**What happens:** You add a `minor` changeset for `@holeauth/core`. All 13 fixed-group packages jump from `0.0.2` to `0.1.0`, including packages you never touched.

**Why:** The `fixed` setting in `config.json` forces all listed packages to the same version. The highest bump type wins across all changesets in the batch.

**Mitigation:**
- Only add bump types proportional to what actually changed
- If only one package in the group genuinely needs `minor`, all will follow — this is intended behaviour. The group exists to keep core packages in lockstep.
- Stale changeset files from a previous cycle (never consumed) compound the problem — always clean up after a release.

### 2. `provenance: true` in `publishConfig`

**What happens:** `pnpm changeset publish` fails locally with:  
`EUSAGE: Automatic provenance generation not supported for provider: null`

**Why:** npm provenance requires GitHub Actions OIDC (`id-token: write` permission). It cannot run locally.

**Fix:** Remove `"provenance": true` from every `packages/*/package.json → publishConfig`. The `release.yml` workflow sets this via the job-level `id-token: write` permission — no package-level config needed.

```bash
# Remove provenance from all packages
for f in packages/*/package.json; do
  node -e "
    const fs = require('fs');
    const j = JSON.parse(fs.readFileSync('$f', 'utf8'));
    if (j.publishConfig?.provenance) {
      delete j.publishConfig.provenance;
      if (Object.keys(j.publishConfig).length === 0) delete j.publishConfig;
      fs.writeFileSync('$f', JSON.stringify(j, null, 2) + '\n');
      console.log('fixed: $f');
    }
  "
done
```

### 3. Commenting out lines in `.npmrc` does not reliably disable them

Some npm versions parse commented-out lines as partial matches. To disable `provenance=true` in `.npmrc`, **delete the line entirely** — do not just comment it out.

### 4. `pre.json → initialVersions` drift

If `initialVersions` records version `0.0.2-alpha.0` but npm has `0.0.3-alpha.0` (because a release happened outside changesets or was manually published), the next `changeset version` will try to bump from `0.0.2` and produce incorrect output.

**Always:** After any manual version correction, update `initialVersions` in `pre.json` to match the last correctly published version.

---

## NEVER DO

| Action | Why |
|---|---|
| `pnpm changeset publish` locally | Bypasses CI provenance, doesn't create Git tags, version drift risk |
| `npm publish` locally | Same reasons; also bypasses turbo build dependency graph |
| Manually edit `"version"` in `package.json` without updating `pre.json` | Causes `initialVersions` drift (see pitfall 4) |
| Edit `pre.json → initialVersions` without following the Recovery procedure | Breaks the version calculation for the next release |
| Commit `pre.json` changes mid-PR after CI has already seen the branch | Creates race conditions with `changeset version` in CI |
| Add `"provenance": true` to `publishConfig` in `package.json` | Breaks all local tooling; CI handles provenance via OIDC |
| Push directly to `main` with version bumps committed | Interferes with the "Version Packages" PR flow; creates double-bump |
