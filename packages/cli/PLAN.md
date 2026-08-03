# shedflare CLI — Plan

> Historical design note. The repository now uses Alchemy as its supported
> deployment lifecycle; follow `README.md` and `AGENTS.md` for current commands.
> The Wrangler-centered design below is retained for context only.

## Purpose

`shedflare` is an npm-publishable CLI that guides users through setting up and deploying a self-hosted Shedflare app suite to their Cloudflare account.

## Package Architecture

```
packages/cli/        (npm: shedflare — published, Node-first)
  Dependencies: cac, @clack/prompts, nano-spawn, jsonc-parser, valibot

The optional terminal UI was never implemented and is not part of the current
workspace.
```

**Historical note:** The TUI was on hold until OpenTUI supported Node.js. No TUI
package shipped, and the core engine remains UI-agnostic.

## Command Surface

```
shedflare init              Create a new Shedflare workspace + guide deploy
shedflare add <app>         Add an app to an existing workspace
shedflare configure         Regenerate wrangler.jsonc from config + manifests
shedflare configure --check Validate generated configs (diff check, part of root check)
shedflare provision         Idempotently create missing Cloudflare resources
shedflare deploy [app]      Build and deploy apps to Cloudflare
shedflare doctor            Validate workspace health
```

## Data Flow

```
Flags / Prompts
     ↓
  InitDraft          Mutable, partially filled input
  { apps, ownerEmail, domain, subdomains, vars, secrets, mockResources }
     ↓ validateDraft()
  InitPlan           Resolved, deploy-ready specification
  { apps, deployOrder, urls, resources, resolvedVars, resolvedSecrets }
     ↓ provisionResources() + writeWorkspaceFiles()
  Generated workspace + provisioned resources
```

This is the TUI boundary. A future TUI would fill an `InitDraft` through its own screens, then call `createPlan()`, `provisionResources()`, and `writeWorkspaceFiles()` from core. No core function ever imports from clack or opentui.

## Embedded Data

The CLI ships with embedded manifest and base config data to support `init` (no workspace exists yet):

- **`core/manifests-data.ts`** — `BUILTIN_MANIFESTS` record of all app manifests
- **`core/templates-data.ts`** — `BASE_CONFIGS` record of all base wrangler configs

`loadManifest()` and `loadBaseConfig()` try the workspace filesystem first, then fall back to embedded data. This means `init` can generate a workspace from scratch, and `configure`/`doctor` prefer the on-disk versions once the workspace exists.

## Source Files

```
packages/cli/src/
  index.ts              cac CLI routing
  commands/
    init.ts             Parse flags → prompts → draft → plan → provision → generate
    add.ts              Add an app to an existing workspace
    configure.ts        Read config → call template → write or diff
    provision.ts        Idempotent resource creation
    deploy.ts           Pre-flight → D1 migrate → build+deploy in order → verify
    doctor.ts           Run all checks → print or --json
  core/
    manifests.ts        AppId union, AppManifest type, loadManifest(), getAllManifests()
    manifests-data.ts   BUILTIN_MANIFESTS — embedded manifest objects for init
    config.ts           ShedflareConfig valibot schema, loadConfig(), validateConfig(), writeConfig()
    init-draft.ts       InitDraft, InitPlan types, createDraft(), validateDraft(), createPlan()
    template.ts         mergeWranglerConfig(base, manifest, config, resources) → wranglerConfig
    templates-data.ts   BASE_CONFIGS — embedded base configs for init
    generate.ts         writeWorkspaceFiles(plan), writeAppFiles(appId, plan), loadBaseConfig()
    provision.ts        provisionResources(plan), provisionSingleResource(resource, appId)
    wrangler.ts         whoami(), login(), createKv(), createD1(), createR2(), putSecret(), deploy()
    validate.ts         runDoctor() → CheckResult[], checkDrift() → DriftReport
    index.ts            Re-exports for TUI consumption
  headless/
    prompts.ts          @clack wrappers: selectApps(), askEmail(), askDomain(), askVar(), askSecret()...
```

## Dependency Direction

```
commands/ → core/ + headless/
headless/ → @clack/prompts only
core/     → nano-spawn, jsonc-parser, valibot (never clack, never opentui)
```

## Config Files

### Source of truth (committed)

```
apps/<app>/shedflare.app.jsonc     # App manifest: vars, secrets, resources required
apps/<app>/wrangler.base.jsonc     # Stable Wrangler config structure
shedflare.config.example.jsonc     # Documented config shape
```

### Generated (gitignored)

```
apps/<app>/wrangler.jsonc          # Generated from base + manifest + user config + resource IDs
shedflare.config.jsonc             # User deployment values, provisioned resource IDs
```

### Generation pipeline

```
embedded manifest data          (used during init, no workspace yet)
  or apps/<app>/shedflare.app.jsonc  (used by configure/doctor)
  + embedded base config data   (used during init)
  + apps/<app>/wrangler.base.jsonc   (used by configure/doctor)
  + shedflare.config.jsonc
  + provisioned resource IDs
  = apps/<app>/wrangler.jsonc
```

The template merging logic (`core/template.ts`) resolves var sources:

- `appUrl` → `https://{subdomain}.{domain}`
- `appUrl(auth)` → resolved URL of another app
- `ownerEmail` → from config
- `user` → prompt the user or read from config vars
- `appId` → `shedflare-{appId}` (e.g. `shedflare-chat`)

## Init Flow

1. Parse flags
2. If interactive: run prompts (app selector, email, domain, per-app settings, wrangler login check)
3. `createDraft(inputs)` → `InitDraft`
4. `validateDraft(draft)` → errors or passes
5. `createPlan(draft, manifests)` → `InitPlan` (resolve URLs, compute deploy order, build resource list)
6. `provisionResources(plan)` → collect resource IDs (or mock them with `--mock-resources`)
7. `writeWorkspaceFiles(plan, config)` → write base configs, generated wrangler.jsonc, shedflare.config.jsonc
8. Print summary and next steps

## Configure & Drift Detection

`shedflare configure`:

1. Load `shedflare.config.jsonc`
2. For each enabled app, load its manifest and base config (filesystem or embedded)
3. Merge into deployable `wrangler.jsonc`
4. Write to `apps/<app>/wrangler.jsonc`

`shedflare configure --check`:

1. Compute expected configs in memory
2. Read actual files from disk
3. Diff them
4. Exit non-zero if drift found, print differences

The root `pnpm check` includes this (`pnpm cli:check`), so config drift breaks CI.

## Doctor Checks

- Node.js version
- Wrangler login status
- `shedflare.config.jsonc` parse and schema
- App manifest availability (filesystem, falls back to embedded)
- Base config availability (filesystem, falls back to embedded)
- Generated config drift
- Missing required secrets (placeholder)

## Rules

1. `core/` never imports from clack, cac, or opentui
2. Every interactive prompt has a `--flag` equivalent
3. Every app change must also update `shedflare.app.jsonc`
4. `configure --check` is part of root `pnpm check`
5. TUI is optional, never a hard dependency (on hold until OpenTUI Node support)
6. `--mock-resources` generates fake but structurally valid resource IDs for CI
7. Core modules ship embedded manifest and base config data so `init` works without an existing workspace

## Implementation Status

| Step | Module                    | Status |
| ---- | ------------------------- | ------ |
| 1    | `core/manifests.ts`       | DONE   |
| —    | `core/manifests-data.ts`  | DONE   |
| 2    | `core/config.ts`          | DONE   |
| 3    | `core/wrangler.ts`        | DONE   |
| 4    | `core/template.ts`        | DONE   |
| —    | `core/templates-data.ts`  | DONE   |
| 5    | `core/init-draft.ts`      | DONE   |
| 6    | `core/generate.ts`        | DONE   |
| 7    | `core/provision.ts`       | DONE   |
| 8    | `core/validate.ts`        | DONE   |
| 9    | `headless/prompts.ts`     | DONE   |
| 10   | `commands/init.ts`        | DONE   |
| 11   | `commands/configure.ts`   | DONE   |
| 12   | `commands/doctor.ts`      | DONE   |
| 13   | `commands/provision.ts`   | DONE   |
| 14   | `commands/deploy.ts`      | DONE   |
| 15   | `commands/add.ts`         | DONE   |
| 16   | `core/index.ts`           | DONE   |
| 16   | Tests (4 files, 34 tests) | DONE   |
| 17   | TUI (future)              | —      |

### Hardening (completed Apr 30)

- `createDraft()` now throws on unknown app IDs instead of silently dropping them
- `createPlan()` uses two-pass URL resolution — all URLs computed before var resolution, fixing cross-app URL refs when apps are listed out of dependency order; throws if a cross-app ref targets a non-selected app
- `getMissingSecrets()` in `validate.ts` replaced placeholder with a real check that reports apps with required secrets needing `wrangler secret put`
- Core test suite added: `init-draft.test.ts` (14), `template.test.ts` (9), `config.test.ts` (6) = 29 tests total

### Phase 2 — May 2025

- **`shedflare provision`** — DONE. Idempotent resource provisioning with `--app` and `--mock-resources` flags. Hardened `provisionResources()` to skip resources already present in `config.resources`, and added `buildPlanFromConfig()` to reuse existing config instead of re-running init prompts.
- **`shedflare deploy [app]`** — DONE. Pre-flight checks (wrangler login, secret verification, config drift), auto-configure, D1 migrations, build+deploy in dependency order via `npm run deploy`, optional `--verify` for post-deploy URL checking. Uses real `wrangler secret list` instead of the old placeholder.
- **`shedflare add <app>`** — DONE. Add an app to an existing workspace with dependency validation, idempotent provisioning, and config merging. Supports `--subdomain`, `--yes`, and `--mock-resources` flags.
- TUI with OpenTUI (when Node.js support lands)
