# Control Plane Foundation Plan

## Scope

This plan combines Phase 0 (record the product and application contract) with
Phase 1 (build the shared config and catalog foundation) from
`docs/control-plane-plan.md`.

The combined phase creates one trustworthy, headless model of the Shedflare
installation. It does **not** build the setup wizard, mutate Cloudflare secrets, or
deploy from the Console yet. Those features should sit on this foundation rather
than inventing their own config, manifest, and app-selection behavior.

The outcome is:

```text
apps/*/shedflare.app.jsonc       shedflare.config.jsonc
             |                            |
             v                            v
       manifest catalog             desired state
             \                            /
              \                          /
               v                        v
                 @shedflare/core
                /        |         \
               v         v          v
          Alchemy       CLI       Console
```

## Why Combine the Phases

The product decisions in Phase 0 cannot be recorded cleanly without changing the
foundation:

- App IDs are manually duplicated in `@shedflare/alchemy` and the CLI.
- The CLI contains a hand-copied `BUILTIN_MANIFESTS` registry that has already
  drifted from the filesystem manifests.
- The Console independently discovers manifests and parses a reduced, unvalidated
  summary type.
- Config types and validation are separately implemented in Alchemy, the CLI, and
  the Console.
- Every app manifest points to a JSON Schema file that does not currently exist.
- Actual manifests contain shapes that the CLI's TypeScript types do not describe,
  such as `from: "computed"` and D1 resources without legacy name/ID fields.

Trying to classify apps or extend manifests before eliminating those splits would
create more duplicated truth. The contract and its shared implementation should
land together.

## Decisions Made in This Phase

### 1. Git remains the distribution model

Shedflare is cloned or forked as source. `@shedflare/core` is a workspace package,
not the start of publishing every app to npm. A future `create-shedflare` npm
launcher may download the repository, but it is outside this phase.

### 2. The Console is the future primary human interface

The supported long-term command surface is:

```text
pnpm setup                         Start or open Console onboarding
shedflare dashboard               Open the configured control plane
shedflare doctor                  Validate local and deployed state
shedflare deploy [app selection]  Scriptable deployment
shedflare destroy [app selection] Scriptable destruction
shedflare secret ...              Scriptable secret operations
```

`shedflare init` remains a compatibility command until the setup wizard replaces
it. This phase does not expand its prompts.

### 3. Filesystem manifests are the app catalog source of truth

`apps/*/shedflare.app.jsonc` defines which source apps are available. There is no
hand-maintained built-in manifest copy and no Console-specific registry.

A generated TypeScript registry provides compile-time `AppId` types and a stable
ordered ID list. The generator reads manifests; developers never edit the generated
file directly.

### 4. Config records sparse desired state

The target config records selected apps and non-secret deviations from manifest
defaults. It does not record secrets, physical resource IDs, deployment history, or
Cloudflare inventory.

App presence means selected. An absent app is not selected. The legacy
`enabled: false` representation is removed in config version 2.

### 5. Deployment stage is not committed to shared config

A stage describes a deployment invocation or a local Console preference, not which
apps belong to the fork. Production remains the deployment default; the Console can
persist a local stage choice separately. This keeps one config usable for production
and temporary stages.

This intentionally refines the earlier strategy document, which showed `stage` in
desired config.

### 6. No app is initially labeled stable

`stable` will mean that an app meets the later health, migration, backup/export, and
recovery contract. Until that contract is implemented and verified, assigning
`stable` would overstate current guarantees.

Proposed initial classification:

| App           | Initial lifecycle | Rationale                                                                             |
| ------------- | ----------------- | ------------------------------------------------------------------------------------- |
| Auth          | `beta`            | Core platform dependency, but security and recovery contract still need hardening     |
| Chat          | `beta`            | Actively developed and deployed; complex sync/server paths need more characterization |
| Drive         | `beta`            | Actively useful and comparatively tested; backup/restore contract is not complete     |
| Money         | `beta`            | Deepest domain and test suite; high-sensitivity data raises the stable bar            |
| Links (`s`)   | `beta`            | Small, deployed application with limited operational coverage                         |
| Anki          | `experimental`    | New and explicitly exploratory                                                        |
| CF Bill       | `experimental`    | Useful but lightly tested and dependent on provider API details                       |
| Homepage      | `experimental`    | Recent personal experiment rather than suite infrastructure                           |
| Observability | `experimental`    | Ingestion exists without a complete owner-facing review loop                          |
| Routines      | `experimental`    | Experimental app with no current tests                                                |

These labels describe support confidence, not application quality. Changing a label
later is a manifest edit backed by explicit criteria.

## Non-Goals

- Building `/setup` or any onboarding UI.
- Connecting a new Cloudflare account.
- Setting, validating, or rotating secret values.
- Changing how Alchemy provisions resources.
- Dynamically composing the root Alchemy stack.
- Adding CI workflows; this phase makes the checks CI-ready.
- Creating an app marketplace or remote app-install protocol.
- Moving experimental apps to a new directory.
- Defining the complete backup/restore implementation.
- Publishing `@shedflare/core` to npm.

## Target Package Boundary

Create `packages/shedflare-core/` with package name `@shedflare/core`.

```text
packages/shedflare-core/
  package.json
  tsconfig.json
  vite.config.ts
  schemas/
    app-manifest.schema.json       # generated
    shedflare-config.schema.json   # generated
  scripts/
    generate-registry.ts
    generate-schemas.ts
  src/
    index.ts
    app-id.ts                      # generated
    config/
      model.ts
      schema.ts
      load.ts
      patch.ts
      migrate.ts
      resolve.ts
    manifests/
      model.ts
      schema.ts
      discover.ts
      dependencies.ts
    paths.ts
  test/
```

The core package is Node-oriented and may access the local filesystem. It must not
depend on SolidJS, the Console, the CLI, Alchemy, or Cloudflare APIs.

Valibot schemas are the canonical runtime definitions. Generate editor-facing JSON
Schemas from them with `@valibot/to-json-schema`; do not hand-maintain parallel JSON
Schema definitions.

Dependency direction:

```text
@shedflare/core
    ^        ^        ^
    |        |        |
Alchemy     CLI    Console server
```

`@shedflare/alchemy` keeps Cloudflare and stack helpers, but imports config and app
identity from `@shedflare/core`.

## Manifest Contract

### Required catalog metadata

Add these fields to every manifest:

```jsonc
{
  "id": "drive",
  "name": "Shedflare Drive",
  "description": "File storage and management",
  "lifecycle": "beta",
  "category": "files",
  "dataSensitivity": "high",
  "dependsOn": ["auth"],
  "defaultSubdomain": "drive",
}
```

Initial category vocabulary:

- `platform`
- `productivity`
- `files`
- `finance`
- `knowledge`
- `media`
- `developer`

Initial data-sensitivity vocabulary:

- `low`: public or low-impact operational data.
- `personal`: ordinary private personal data.
- `high`: financial records, private files, credentials, or detailed activity data.

Do not add setup-form definitions or rich credential metadata in this phase. The
manifest model should allow those fields to be added later without changing the
catalog source of truth.

### Existing deployment metadata

Normalize and validate the existing fields:

- `dependsOn`
- `defaultSubdomain`
- `vars`
- `secrets`
- `resources`

The runtime schema must describe actual current usage, including:

- Variable sources `url`, `appUrl`, `ownerEmail`, `user`, `appId`, and `computed`.
- Optional defaults for user-provided vars.
- Required and optional secrets.
- KV, D1, R2, Durable Object, and Browser resource descriptors.
- Optional legacy resource naming fields where current manifests differ.

Manifest resources remain descriptive in this phase; Alchemy stacks remain the
infrastructure source of truth. A future consistency check may compare them.

### Parsing behavior

`loadManifest` returns a validated, normalized manifest or a structured error with:

- File path.
- JSONC parse location when available.
- Invalid field path.
- Human-readable expectation.

It must not mutate parsed objects in place to add defaults.

`discoverManifests(root)`:

1. Finds `apps/*/shedflare.app.jsonc` in deterministic ID order.
2. Parses every manifest.
3. Verifies directory name equals manifest ID.
4. Rejects duplicate IDs.
5. Verifies all dependencies exist.
6. Detects dependency cycles.
7. Returns all errors together when practical, so `doctor` is useful.

## Generated App Registry

Generate only information that needs to exist at compile time:

```ts
// Generated from apps/*/shedflare.app.jsonc. Do not edit.
export const APP_IDS = [
  "anki",
  "auth",
  // ...
] as const;

export type AppId = (typeof APP_IDS)[number];
```

Rules:

- The generated registry is committed.
- Full manifest objects are not copied into generated TypeScript.
- `registry:generate` rewrites it deterministically.
- `registry:check` fails when regeneration would change it.
- Root `pnpm check` eventually includes `registry:check`.
- An agent adding or removing an app is instructed to regenerate the registry.

This replaces:

- The `AppId` union in `packages/shedflare-alchemy/src/config.ts`.
- The `AppId` union and `APP_IDS` list in `packages/cli/src/core/manifests.ts`.
- `packages/cli/src/core/manifests-data.ts`.
- Console-only app ID discovery logic.

The root `alchemy.run.ts` still imports stacks explicitly in this phase. Dynamic
stack composition belongs to the deployment phase because it changes resource
lifecycle behavior.

## Config Version 2

### Target shape

```jsonc
{
  "$schema": "./packages/shedflare-core/schemas/shedflare-config.schema.json",
  "configVersion": 2,
  "domain": "example.com",
  "ownerEmail": "you@example.com",
  "apps": {
    "auth": {},
    "chat": {
      "subdomain": "ai",
      "vars": {
        "DEFAULT_MODEL_ID": "auto",
      },
    },
    "drive": {},
  },
}
```

Semantics:

- App presence means selected.
- Missing `subdomain` resolves to the manifest's `defaultSubdomain`.
- Missing `vars` resolves to manifest defaults where declared.
- `vars` contains only non-secret user-configurable overrides.
- `$schema` is optional at runtime but always written by Shedflare.
- `configVersion` is required in newly written configs.
- Unknown top-level and app fields produce validation errors rather than silently
  disappearing.
- Unknown app IDs are errors with a suggestion to regenerate the registry or remove
  stale config.

### Normalized and resolved models

Keep raw desired state separate from runtime convenience:

```ts
interface ShedflareConfigV2 {
  readonly configVersion: 2;
  readonly domain: string;
  readonly ownerEmail: string;
  readonly apps: Readonly<Partial<Record<AppId, AppSelection>>>;
}

interface ResolvedAppConfig {
  readonly appId: AppId;
  readonly domain: string;
  readonly configuredSubdomain: string;
  readonly stageSubdomain: string;
  readonly url: string;
  readonly ownerEmail: string;
  readonly vars: Readonly<Record<string, string>>;
}
```

Alchemy should consume `ResolvedAppConfig`; the Console should normally display raw
intent plus resolved previews.

### Version 1 migration

Current config is treated as version 1 when `configVersion` is absent.

Migration rules:

1. Keep entries whose `enabled` value is not `false`.
2. Remove disabled app entries.
3. Omit a subdomain when it equals the manifest default.
4. Keep a non-default subdomain under the app entry.
5. Move `vars[appId]` under `apps[appId].vars`.
6. Remove empty top-level `vars` and `resources` objects.
7. Never infer secret values or move environment variables into config.
8. If legacy `resources` contains values, report them explicitly. Do not silently
   discard them during an automatic write.

Migration is never performed as a side effect of reading config.

Core APIs:

```ts
inspectConfig(root): ConfigInspection
migrateConfig(input, catalog): ConfigMigration
writeConfigMigration(migration): void
```

`ConfigMigration` includes old version, new config, warnings, and a textual diff.
Writing:

- Requires explicit confirmation or `--yes`.
- Creates a timestamped local backup beside the gitignored config.
- Uses a temporary file plus atomic rename.
- Revalidates the result before replacement.

During this phase all consumers read both versions through one loader. New writes
use version 2. This avoids forcing migration and consumer rewrites into one risky
step.

### Comment-preserving edits

Use `jsonc-parser` edits for field-level config patches so comments and unrelated
formatting survive Console changes. Full migration may produce normalized JSONC
after writing a backup; ordinary edits should not stringify the entire file.

## Core APIs

The first public surface should stay small:

```ts
// App identity and catalog
APP_IDS;
isAppId(value);
discoverManifests(root);
loadManifest(root, appId);
resolveAppDependencies(selected, catalog);
computeDeployOrder(selected, catalog);

// Config
inspectConfig(root);
loadConfig(root);
validateConfig(value, catalog);
migrateConfig(value, catalog);
patchConfig(root, patch, catalog);
resolveAppConfig(config, catalog, appId, stage);
stageSubdomain(subdomain, stage);

// Paths
findRepoRoot(start);
configPath(root);
manifestPath(root, appId);
```

Avoid exporting filesystem internals or large service classes prematurely. Add
interfaces as real Console and CLI workflows demand them.

All failures used by a user interface should have stable codes and structured
details in addition to messages. Examples:

- `CONFIG_NOT_FOUND`
- `CONFIG_PARSE_ERROR`
- `CONFIG_VERSION_UNSUPPORTED`
- `CONFIG_UNKNOWN_APP`
- `MANIFEST_INVALID`
- `MANIFEST_ID_MISMATCH`
- `MANIFEST_DEPENDENCY_MISSING`
- `MANIFEST_DEPENDENCY_CYCLE`

## Consumer Migration

Migrate consumers in this order so there is always a working implementation.

### 1. `@shedflare/alchemy`

- Add a dependency on `@shedflare/core`.
- Re-export `AppId` only as a temporary compatibility path.
- Replace local config loading and app resolution with core APIs.
- Keep `appConfig`, `requireVar`, `optionalVar`, and Effect integration as thin
  Alchemy adapters.
- Preserve existing stage URL behavior.
- Update config tests to cover both config versions.

Do not change app stacks beyond imports or type adjustments required by the shared
model.

### 2. CLI

- Add a dependency on `@shedflare/core`.
- Replace local config, manifest, dependency-order, and app-ID implementations.
- Delete `manifests-data.ts` after consumers use filesystem discovery.
- Make `doctor` report all catalog and config validation errors.
- Add `shedflare config migrate` with `--check`, `--write`, `--yes`, and structured
  JSON output if the CLI already supports JSON conventions.
- Keep `init` compatible, but make new config writes produce version 2.
- Keep existing deploy behavior; selected apps now come from config presence.

The future out-of-repository `npx create-shedflare` flow will download source before
using the catalog. It is not a reason to retain embedded manifest copies.

### 3. Console server

- Add a dependency on `@shedflare/core`.
- Delete manifest parsing and config model duplication from `config-service.ts`.
- Keep repository-specific HTTP concerns in the Console.
- Derive `ManifestSummary` for API responses from validated core manifests.
- Make config PATCH use core validation and comment-preserving patching.
- Continue returning `configPresent: false` without requiring Cloudflare credentials.
- Keep inventory discovery in the Console until a later operations-layer extraction;
  only catalog/config foundations move now.

The Console UI should require minimal compatibility updates only. `/setup` is the
next phase.

### 4. Deprecated re-exports

- Update `infra/alchemy-config.ts` and `infra/alchemy-env.ts` to re-export through
  their supported package paths or remove them if no consumer remains.
- Mark temporary type re-exports with a deletion condition, not an indefinite
  deprecation note.

## Work Breakdown

### Milestone A: Scaffold and characterize

Changes:

- Create `@shedflare/core` package with Vite+ scripts.
- Add characterization tests for current stage URL resolution, config acceptance,
  app discovery, dependency ordering, and Console patch semantics.
- Add fixtures for valid and invalid manifests and config versions.
- Record the supported command surface in the root README.

Exit criteria:

- The new package participates in `pnpm check` and `pnpm test`.
- Existing behavior needed by Alchemy, CLI, and Console is captured before moving
  code.
- No production behavior changes.

### Milestone B: Manifest model and registry

Changes:

- Implement the runtime manifest schema and error model.
- Add lifecycle, category, and data-sensitivity fields to every app manifest.
- Add proposed initial lifecycle classifications.
- Generate the real JSON Schema and repair all manifest `$schema` references.
- Implement discovery, dependency validation, cycle detection, and ordering.
- Generate `APP_IDS` and `AppId`.
- Add registry drift verification.

Exit criteria:

- Every manifest validates against runtime and JSON schemas.
- Directory IDs, manifest IDs, dependencies, and generated IDs agree.
- No hand-maintained full manifest registry remains authoritative.

### Milestone C: Config model and migration

Changes:

- Implement versioned raw config schemas.
- Implement normalized loading for versions 1 and 2.
- Implement sparse defaults and app config resolution.
- Implement version 1 inspection, migration preview, warnings, atomic writes, and
  backups.
- Generate the config JSON Schema.
- Implement comment-preserving patches.

Exit criteria:

- Current config continues to load without mutation.
- A version 1 fixture migrates deterministically to version 2.
- Nonempty legacy resource state can never be silently discarded.
- Version 2 round-trips through load, patch, and resolution.

### Milestone D: Alchemy migration

Changes:

- Make `@shedflare/alchemy` depend on the core package.
- Replace its local app ID and config model.
- Preserve Effect adapters and stack-facing helpers.
- Run app-stack type checks against both legacy and new config fixtures.

Exit criteria:

- Individual and root Alchemy stacks type-check without their own config model.
- Stage-derived URLs and config vars resolve identically for version 1.
- Version 2 configs resolve to equivalent stack inputs.

### Milestone E: CLI migration

Changes:

- Replace duplicated core modules with imports from `@shedflare/core`.
- Delete embedded manifest data.
- Write version 2 from `init`.
- Add explicit migration command and richer `doctor` catalog checks.
- Update CLI tests around selection-by-presence.

Exit criteria:

- CLI app listing exactly matches filesystem manifests.
- `init`, `doctor`, individual deploy selection, and full deploy selection work with
  version 2.
- Version 1 remains readable with a visible migration recommendation.
- No app ID union or full manifest copy remains in the CLI.

### Milestone F: Console migration and cleanup

Changes:

- Replace Console config and manifest parsing with core APIs.
- Preserve API response compatibility where practical.
- Switch PATCH writes to comment-preserving core edits.
- Remove duplicate tests that only test the old Console-local model; retain adapter
  and API tests.
- Remove obsolete Alchemy/CLI/Console types and repair documentation references.

Exit criteria:

- Console, CLI, and Alchemy report the same selected apps, URLs, and manifest data.
- Config comments survive ordinary Console edits.
- The Console starts successfully with no config and with either supported config
  version.
- `pnpm check` and `pnpm test` pass for all touched packages.

### Milestone G: Contract gate

Changes:

- Add a root command that verifies generated files, manifests, and example config.
- Make the committed example config version 2 and sparse.
- Update `AGENTS.md`, README, and the parent control-plane plan with final decisions.
- Label old planning documents as historical where they contradict the new command
  or config boundary.

Exit criteria:

- One command catches catalog/config drift locally and is ready to place in CI.
- Adding an app has one documented registry-generation step and no manual union or
  manifest-copy edits.
- Removing an app produces actionable config/dependency errors.
- The next `/setup` phase can consume core APIs without defining new domain models.

## Test Plan

### Manifest tests

- Discover all current manifests.
- Reject malformed JSONC with file and location.
- Reject directory/ID mismatch.
- Reject duplicate IDs.
- Reject missing dependencies.
- Reject dependency cycles with the complete cycle path.
- Accept all current var and resource variants.
- Produce deterministic dependency ordering.
- Detect generated registry drift.
- Validate generated JSON Schema against representative fixtures.

### Config tests

- Parse and validate version 1 and version 2.
- Reject unsupported future versions with an actionable error.
- Reject unknown apps and unknown fields.
- Apply manifest subdomain and var defaults.
- Preserve non-default subdomains and user vars.
- Treat app presence as selection in version 2.
- Migrate disabled version 1 apps by removing them.
- Move version 1 vars under app entries.
- Warn and block automatic writes for nonempty legacy resources.
- Preserve comments during ordinary patches.
- Make migration output deterministic and idempotent.
- Preserve files after simulated write failure.

### Consumer contract tests

- Alchemy resolves equivalent version 1 and version 2 configs to the same app URL
  and vars.
- CLI and Console return the same app ID set and dependency order.
- CLI selection and Console selected state agree with config presence.
- Console can load without config and does not require Cloudflare access to show the
  catalog.
- Example config validates and resolves every selected app.

## Validation Commands

Exact package script names may be adjusted during implementation, but the completed
phase must support the equivalent of:

```bash
pnpm --filter @shedflare/core check
pnpm --filter @shedflare/core test
pnpm --filter @shedflare/alchemy test
pnpm --filter shedflare test
pnpm --filter @shedflare/console test
pnpm registry:check
pnpm check
pnpm test
```

No live Cloudflare deployment is required to accept this foundation phase. A final
read-only Alchemy plan or existing guarded smoke test may be run separately if local
credentials are intentionally available.

## Rollout and Compatibility

Land milestones as separate focused commits where practical. Do not combine the
package extraction, config migration, and all consumer deletions into one opaque
rewrite.

Compatibility policy for this phase:

- Version 1 config remains readable throughout the phase.
- Version 1 is never rewritten implicitly.
- New config writes use version 2 once all consumers can read it.
- Migration warnings are informational until the explicit migration command lands.
- Temporary re-exports keep app stacks compiling while imports move.
- Existing production resources are not changed by config-file migration alone.
- No deploy or destroy command runs as part of migration.

Rollback is source-based:

- Config migration creates a local backup.
- Each consumer migration is independently revertible.
- The old readers are deleted only after their consumer tests pass against the
  shared core.

## Risks and Mitigations

### Risk: the core package becomes a dumping ground

Mitigation: limit this phase to app identity, manifests, desired config, paths, and
dependency resolution. Cloudflare inventory and deployment remain outside until
their shared interfaces are designed from real Console workflows.

### Risk: generated code creates another source of truth

Mitigation: generate only IDs and types, make generation deterministic, commit the
output, and fail checks on drift. Full manifests remain on disk only.

### Risk: config migration affects production

Mitigation: migration never deploys, destroys, or mutates Cloudflare. Version 1
continues to load. Writes are explicit, backed up, atomic, and blocked on unresolved
legacy resource data.

### Risk: sparse defaults make behavior less visible

Mitigation: core APIs expose raw and resolved views. The future Console review step
shows resolved subdomains, vars, dependencies, and URLs before writing or deploying.

### Risk: lifecycle labels become subjective or stale

Mitigation: no app starts stable; promotion criteria are tied to the later
operational contract. The label is visible in both catalog and review surfaces.

### Risk: custom fork apps break generated `AppId` types

Mitigation: app addition documentation includes registry generation, and the drift
check explains the exact command. Runtime discovery still produces useful errors
before generation.

## Definition of Done

The combined phase is complete when all of the following are true:

- `@shedflare/core` is the only implementation of app discovery, manifest parsing,
  config parsing, config migration, and dependency ordering.
- Each app has an honest lifecycle, category, and data-sensitivity declaration.
- All manifests validate and point to a real generated JSON Schema.
- `AppId` and `APP_IDS` are generated from filesystem manifests.
- The CLI's embedded manifest registry is deleted.
- Alchemy, CLI, and Console consume the shared models.
- Config version 1 remains safely readable.
- Config version 2 is sparse, versioned, schema-backed, and used for new writes.
- Migration is explicit, previewable, atomic, and does not silently discard legacy
  state.
- Ordinary config patches preserve comments.
- A local drift check is ready to become a CI gate.
- Root documentation names one supported setup/deployment direction.
- No Cloudflare resources or secrets were changed merely by completing this phase.

At that point, the setup wizard is mostly a presentation and workflow layer over
trusted operations rather than a new source of product rules.
