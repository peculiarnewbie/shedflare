# ADR 0001: Standalone-first repositories

- Status: Superseded by [ADR 0002](0002-modular-monorepo.md)
- Date: 2026-08-07
- Owners: Shedflare maintainers
- Supersedes: The monorepo-as-distribution model described in the root README

This ADR records the split-repository experiment and remains useful historical context. The
experiment was completed, evaluated in normal development, and reversed; its repositories are no
longer canonical sources.

## Context

Shedflare is a family of self-hosted personal applications. Most installations are expected to
contain one application or a small subset; installing the complete suite is an exceptional use
case.

The current repository makes the full monorepo the distribution unit. A person who wants one app
must obtain every app, the website, the local console, suite configuration, and root deployment
orchestration. This optimizes maintainer development at the expense of the primary installation
experience.

The existing implementation also contains repository-level coupling that prevents a mechanical
split:

- `@shedflare/core` finds a repository root by looking for `pnpm-workspace.yaml` and `apps/`, then
  discovers the catalog from `apps/*/shedflare.app.jsonc`.
- The generated `AppId` type assumes a closed, centrally known catalog.
- Shared packages are mostly private, use `workspace:*` and the root dependency catalog, and export
  TypeScript source rather than distributable build artifacts.
- The Auth stack discovers selected apps to construct `ALLOWED_CLIENTS`.
- The root Alchemy stack imports every application stack and performs suite-wide observability
  wiring.
- `@shedflare/ui` is not yet consumed by the apps; each app currently owns its CSS.

Repository extraction therefore follows contract cleanup rather than preceding it.

## Decision

Shedflare will become a family of independently installable and deployable applications. The suite
will be an explicit, optional composition layer.

The default product journey is:

```text
choose one app -> configure it -> deploy it
```

The opt-in suite journey is:

```text
choose suite mode -> select apps -> deploy pinned app releases together
```

No application may require a checkout of another Shedflare repository for installation,
development, tests, or deployment.

## Repository boundaries

The intended GitHub organization layout is:

```text
shedflare/shedflare       optional suite orchestrator, CLI, console, and release registry
shedflare/packages        shared, independently versioned packages
shedflare/auth            optional shared SSO deployment
shedflare/anki            standalone app
shedflare/cf-bill         standalone app
shedflare/chat            standalone app
shedflare/discord         standalone personal Discord bot
shedflare/drive           standalone app
shedflare/homepage        standalone app
shedflare/links           standalone app; current app id remains `s` until separately migrated
shedflare/money           standalone app
shedflare/observability   optional suite integration
shedflare/routines        standalone app
shedflare/site            public project website
shedflare/.github         organization profile and shared community configuration
```

The original `peculiarnewbie/shedflare` repository was transferred to `shedflare/shedflare` on
2026-08-08 and will evolve into the optional suite repository. It will remain operational throughout
migration. App repositories will be extracted with their relevant Git history; the original history
will remain in the suite repository as well.

The `shedflare` GitHub organization and npm organization scope were reserved on 2026-08-08. They are
separate resources with separate access and release configuration; npm organization and publishing
operations remain maintainer-managed.

### Extraction status

The shared packages were extracted with their Git history to
[`shedflare/packages`](https://github.com/shedflare/packages) on 2026-08-08. That repository is now
the canonical source for `@shedflare/auth-client`, `@shedflare/core`, `@shedflare/alchemy`,
`@shedflare/test-utils`, and `@shedflare/ui`.

The copies under this suite repository are a frozen compatibility snapshot until the suite is
changed to consume released versions. Do not make new shared-package changes here; make them in
`shedflare/packages` and bring them back only through a versioned package update.

The first public npm releases were published on 2026-08-09: `@shedflare/core@0.1.0`,
`@shedflare/auth-client@0.1.0`, `@shedflare/alchemy@0.1.0`, and
`@shedflare/test-utils@0.1.0`. The remaining shared packages stay unpublished until an independent
repository needs them.

Anki was extracted with its app history to [`shedflare/anki`](https://github.com/shedflare/anki) on
2026-08-09. That repository is now the canonical source for Anki. Its frozen-lockfile install,
checks, tests, and build passed from an app-only checkout using the public package releases. A
temporary non-production Cloudflare stage also planned, deployed, passed its public and auth smoke
checks, and was destroyed successfully. The `apps/anki` copy here is a frozen compatibility
snapshot pending suite release orchestration; do not make new Anki changes in this repository.

Drive was extracted with its app history to
[`shedflare/drive`](https://github.com/shedflare/drive) on 2026-08-09. That repository is now the
canonical source for Drive. Its app-only frozen-lockfile install, checks, 102 tests, and build passed
using public package releases. A temporary Cloudflare stage created an isolated Worker, D1 database,
and R2 bucket; four browser tests exercised mobile navigation, authentication state, and the complete
file upload, metadata, download, search, sharing, and deletion lifecycle. On 2026-08-09, the standalone
repository took over the existing production `ShedflareDrive/prod` Alchemy state in place. The D1
database ID, R2 bucket, Worker name, and custom domain did not change, and before/after file and byte
counts matched. Drive is no longer composed by the suite root stack or exposed through suite deploy
and destroy scripts. The `apps/drive` copy here is a frozen rollback snapshot; do not make new Drive
changes in this repository and never destroy it from this checkout.

On 2026-08-09, the remaining deployables were extracted with their relevant path history to
[`shedflare/auth`](https://github.com/shedflare/auth),
[`shedflare/cf-bill`](https://github.com/shedflare/cf-bill),
[`shedflare/chat`](https://github.com/shedflare/chat),
[`shedflare/discord`](https://github.com/shedflare/discord),
[`shedflare/homepage`](https://github.com/shedflare/homepage),
[`shedflare/links`](https://github.com/shedflare/links),
[`shedflare/money`](https://github.com/shedflare/money),
[`shedflare/observability`](https://github.com/shedflare/observability),
[`shedflare/routines`](https://github.com/shedflare/routines), and
[`shedflare/site`](https://github.com/shedflare/site). Chat owns the former sync-protocol package as
an internal deep module. Each repository installs from its own frozen lockfile and passed its local
checks, normal non-live tests, and build without sibling paths. These repositories are now the
canonical source for new application changes.

Except for Drive's previously completed handoff, production state ownership has not moved. The
suite copies remain frozen compatibility or rollback snapshots until each extracted stack passes an
isolated deployment rehearsal and an explicitly approved production cutover. The suite still uses
source composition temporarily; release transport, pinning, and orchestration remain a separate
migration gate.

## Shared package contract

The initial `shedflare/packages` repository will contain:

| Package                  | Responsibility                                                      |
| ------------------------ | ------------------------------------------------------------------- |
| `@shedflare/core`        | Topology-independent manifest and configuration contracts           |
| `@shedflare/alchemy`     | Shared Alchemy and Cloudflare deployment primitives                 |
| `@shedflare/auth-client` | Embedded-owner-auth and external-issuer integration                 |
| `@shedflare/ui`          | Theme tokens, generated CSS, recipes, and optional Solid components |
| `@shedflare/test-utils`  | Optional development-only Cloudflare test helpers                   |

`@shedflare/sync-protocol` will move into the Chat repository unless another independent consumer
appears before extraction.

All published packages must:

- contain compiled JavaScript and TypeScript declarations;
- expose only documented package entry points;
- install without workspace links or the root pnpm catalog;
- use semantic versions and produce immutable release artifacts;
- pass an `npm pack` consumer smoke test before publication;
- avoid filesystem and process-global assumptions in pure contract modules.

`@shedflare/core` will validate a single manifest or a catalog supplied explicitly by its caller. It
will not discover `apps/*` or define the complete set of Shedflare apps. App identifiers will be
validated values rather than a generated closed union. Node-specific file discovery, standalone
workspace loading, and remote release-registry loading will be adapters outside the pure contract.

The manifest schema will be explicitly versioned. Compatibility between an app manifest, the CLI,
and shared packages must be machine-readable and checked before deployment.

## Authentication contract

Standalone apps should not require the optional central Auth deployment. The accepted direction is
two explicit authentication modes represented as a discriminated configuration:

```text
embedded  -> the app owns its issuer routes and auth storage
external  -> the app consumes an explicitly configured issuer URL
```

`embedded` is the intended standalone default. `external` is the intended suite mode, with
`shedflare/auth` providing shared SSO. An app manifest declares its supported modes, stable client
identifier, and callback path.

This direction is subject to an implementation gate before repository extraction. A prototype in a
small app must demonstrate:

- Google login and owner-email enforcement;
- refresh, logout, and expired-session behavior;
- exact client and redirect-origin validation;
- no open redirect or cross-app token acceptance;
- both embedded and external modes using the same consumer contract;
- a documented transition between modes, including expected session invalidation;
- standalone deployment without suite-owned state.

If embedded mode cannot satisfy that gate without unreasonable duplication or security risk, the
fallback is a separately deployed Auth dependency installed by the common CLI. No app stack may
independently claim management of the same shared Auth resources; resource ownership must remain
singular.

## Styling contract

Visual consistency will be distributed as a versioned package rather than by sharing application
source.

`@shedflare/ui` owns:

- stable CSS custom-property names and default theme values;
- reset and generated base CSS;
- typed style recipes;
- small reusable Solid primitives and components.

Each application owns its feature layout and app-specific CSS. Consuming apps must not scan or import
files from the UI package's source directory. Theme customization will use app-local CSS-variable
overrides, so customizing a standalone app does not require forking `shedflare/packages`.

Adopting the UI package is not a prerequisite for extracting an app. Existing app CSS remains valid
until migrated incrementally.

## Deployment and suite contract

Each application release owns its deployable application artifact and Alchemy entrypoint. Standalone
and suite deployments must invoke the same released artifact.

The suite will no longer import application source into one root Alchemy program. It will:

1. resolve selected app versions from an explicit release registry;
2. record exact sources, versions, and integrity values in `shedflare.lock`;
3. deploy dependencies in topological order;
4. invoke each app's deployment entrypoint;
5. perform optional suite wiring, such as shared Auth and observability, after app deployment;
6. record deployment outputs and support resuming a partially completed run.

The suite must not use Git submodules, unpinned Git branches, or unpublished workspace packages.

Alchemy state continuity is a release gate. Moving a stack to a new repository must preserve its
logical stack identity, physical resource names, stage behavior, and ownership. Before any production
cutover, an extracted app must be rehearsed against a temporary stage and demonstrate that its plan
does not unexpectedly replace Workers, KV namespaces, D1 databases, R2 buckets, Durable Objects, or
other persistent resources.

## Human and agent interface

Every app will expose the same conceptual commands:

```text
dev
check
test
doctor
plan
deploy
destroy
```

Every interactive choice must have a non-interactive equivalent. Commands that inspect, plan, or
mutate deployment state must support stable machine-readable output. Deploy operations must be
idempotent, and errors must identify a stable error code, the failing field or resource when known,
and a concrete remediation.

Secrets may be accepted through documented environment variables or secret-management commands but
must never be printed in structured output. Each app repository will include an `AGENTS.md` describing
its local commands, boundaries, and verification requirements.

## Release policy

- Shared packages and apps release independently using semantic versions.
- Apps consume published package versions and commit their lockfiles.
- The suite consumes released app artifacts and commits a suite lockfile.
- Cross-repository updates are automated through dependency-update pull requests.
- Suite compatibility CI tests pinned releases, not the heads of unrelated repositories.
- A release must not depend on an unpublished commit from another repository.

Initial extracted releases may remain `0.x` while contracts are evolving. Stability promises will be
made per package and per app rather than for the organization as a whole.

## Migration sequence and gates

1. **Organization foundation:** reserve namespaces, establish organization policies, transfer the
   current repository, and keep it operational.
2. **Boundary enforcement:** remove hidden root dependencies, workspace-only resolution, catalog-only
   versions, and filesystem catalog assumptions while still in the monorepo.
3. **Package release:** extract and publish installable shared packages, then make existing apps consume
   those releases.
4. **Auth prototype:** prove the two-mode Auth contract and its security properties.
5. **Pilot extraction:** extract a small representative app and validate standalone and suite flows.
6. **Incremental extraction:** move remaining apps one at a time, leaving Chat and other high-coupling
   apps until late in the sequence.
7. **Suite conversion:** replace source composition with release orchestration.
8. **UI adoption:** migrate tokens and components incrementally after repository boundaries are stable.

An app passes its extraction gate only when an app-only checkout can install with a frozen lockfile,
run checks and tests, produce a deployment plan, smoke-deploy a temporary stage, and destroy that
temporary stage without requiring the old monorepo.

## Cutover and rollback policy

Extraction is a staged cutover, not a simultaneous rewrite.

- Do not delete an app from the monorepo when its target repository is first created.
- Freeze the old app directory while validating the independent release to avoid dual sources of truth.
- Remove the old directory only in a later change after standalone and suite-managed deployment pass.
- Preserve the old repository history and release artifacts.
- Do not perform automatic destructive rollback of persistent Cloudflare resources.
- A failed orchestration run must be resumable from recorded successful outputs.
- Production migration requires an inventory and state backup appropriate to the resources being moved.

During Phase 0, existing uncommitted application work is not modified, staged, or committed as part of
this decision record.

## Consequences

Positive consequences:

- A single app is the smallest installation and contribution unit.
- App releases and documentation become independently understandable.
- Suite complexity is paid only by suite users.
- Agents receive smaller contexts and consistent machine-readable operations.
- An app can evolve without requiring a release of every other app.

Costs and risks:

- Shared contracts require real versioning and compatibility management.
- Changes spanning apps require coordinated pull requests rather than one atomic commit.
- CI, dependency automation, and release infrastructure multiply across repositories.
- Auth and Alchemy ownership errors could affect security or persistent data and therefore require
  explicit gates.
- A long dual-maintenance period would be expensive, so each extraction should have a short, declared
  freeze and cutover window.

## Deferred implementation choices

This ADR fixes the product and ownership boundaries but intentionally does not choose:

- whether app release artifacts are transported through npm, GitHub Releases, or both;
- the release automation implementation used for independently versioned packages;
- the exact embedded Auth route prefix and storage layout;
- the first pilot app, beyond requiring a small representative consumer;
- the final public repository name for the current `s` app;
- the release-registry hosting mechanism.

Those choices must satisfy the contracts and gates above. They do not require reopening the
standalone-first decision.

## Non-goals

- Adding multi-user accounts, tenant isolation, or per-user configuration.
- Making the complete suite the default installer path.
- Rewriting apps or standardizing all UI before extraction.
- Splitting every internal module into its own repository.
- Changing production resource names merely to match new repository names.
- Replacing Alchemy as part of the repository migration.
