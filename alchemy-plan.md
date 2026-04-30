# Alchemy Migration Plan

## Decision

Shedflare should move toward an Alchemy-first architecture.

The current CLI provisions and deploys Cloudflare resources by shelling out to Wrangler, parsing command output, generating `wrangler.jsonc`, and persisting resource IDs in `shedflare.config.jsonc`. That works for a small surface area, but it is brittle and puts too much long-term infrastructure lifecycle responsibility on Shedflare itself.

Alchemy v2 changes the shape of the problem. It is not just a better way to create KV, D1, and R2 resources. It can become the infrastructure, deployment, local development, CI preview, and integration testing substrate for the whole suite.

The target direction is:

- Alchemy owns cloud resource lifecycle.
- Each app is wrapped by an Alchemy stack.
- The root suite composes app stacks.
- The `shedflare` CLI becomes a thinner orchestration and configuration helper.
- Wrangler becomes an implementation detail or escape hatch, not the primary API Shedflare maintains.

## Why This Is Worth It

Going all in on Alchemy is more valuable than using it only to replace `shedflare provision`.

Alchemy can potentially remove entire categories of Shedflare-specific glue:

- Manual Wrangler command wrappers.
- Human-output parsing for `whoami`, `d1 create`, `deploy`, secrets, etc.
- Custom provisioning planner.
- Custom idempotency and partial-failure recovery.
- Generated `wrangler.jsonc` as the central deploy artifact.
- Manual resource ID storage in `shedflare.config.jsonc`.
- Config drift detection between manifests, generated configs, and deployed resources.
- Split-brain lifecycle between resource creation, app deployment, local dev, and tests.

It also unlocks things Shedflare does not have today:

- Real Cloudflare-backed integration tests.
- Per-PR preview environments.
- First-class destroy/cleanup.
- Typed Worker bindings via `Cloudflare.InferEnv`.
- D1 migrations as part of stack lifecycle.
- Local development with real cloud resources and local Worker execution.
- CI credentials and preview comments as code.

## Current Architecture

Today, the CLI is the center of deployment orchestration.

Important files:

- `packages/cli/src/core/provision.ts` provisions resources from app manifests.
- `packages/cli/src/core/wrangler.ts` shells out to Wrangler and parses output.
- `packages/cli/src/core/generate.ts` writes generated `wrangler.jsonc` files.
- `apps/*/shedflare.app.jsonc` declares app-level resources, vars, secrets, and dependencies.
- `apps/*/wrangler.base.jsonc` stores stable Wrangler config structure.
- `shedflare.config.jsonc` stores deployment-specific values and provisioned resource IDs.

This has been a reasonable bootstrap path, but it is the wrong long-term abstraction if Alchemy can own the full lifecycle.

## Target Architecture

Each app should have an Alchemy stack colocated with the app:

```txt
apps/auth/
  alchemy.run.ts
  src/worker.ts

apps/drive/
  alchemy.run.ts
  src/worker.ts
  migrations/

apps/chat/
  alchemy.run.ts
  src/worker.ts

alchemy.run.ts
packages/cli/
```

The root stack composes the suite:

```ts
export default Alchemy.Stack(
  "Shedflare",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const auth = yield* AuthStack;
    const drive = yield* DriveStack({ authUrl: auth.url });
    const chat = yield* ChatStack({ authUrl: auth.url });

    return {
      authUrl: auth.url,
      driveUrl: drive.url,
      chatUrl: chat.url,
    };
  }),
);
```

The CLI remains the user-facing entrypoint:

```sh
shedflare init
shedflare configure
shedflare dev
shedflare deploy
shedflare test
shedflare destroy
shedflare doctor
```

But those commands should mostly validate Shedflare config, collect owner preferences, compute stage/app selection, and call Alchemy.

## Configuration Boundary

`shedflare.config.jsonc` should represent user intent, not deployed cloud reality.

It should keep values like:

- Enabled apps.
- Base domain.
- App subdomains.
- Owner email.
- OAuth client IDs.
- Model defaults.
- Optional development defaults.

It should stop storing values Alchemy can own:

- KV namespace IDs.
- D1 database IDs.
- R2 bucket IDs.
- Generated binding metadata.
- Deployed Worker URLs when those can be stack outputs.

Alchemy state should become the source of truth for physical cloud resources.

## App Stack Responsibilities

### Auth

Auth is the best first migration target because it is small.

Responsibilities:

- Worker deployment.
- `OPENAUTH_STORAGE` KV namespace.
- `APP_PUBLIC_URL` var.
- `GOOGLE_CLIENT_ID` var.
- `OWNER_EMAIL` var.
- Future auth secrets if needed.

Validation goals:

- Confirm basic async Worker deployment works without rewriting runtime code to Effect.
- Confirm KV binding works.
- Confirm `Cloudflare.InferEnv<typeof Worker>` can replace hand-maintained env types.
- Confirm app URL output is usable by dependent stacks.

### Drive

Drive should be second because it exercises the most important infrastructure lifecycle features.

Responsibilities:

- Vite/Cloudflare Worker deployment.
- Static assets.
- D1 database.
- D1 migrations via `migrationsDir`.
- R2 bucket.
- Auth dependency vars.
- Owner vars.

Validation goals:

- Confirm `Cloudflare.Vite` works cleanly with the current Vite+ setup.
- Confirm D1 migrations apply on deploy and skip on subsequent deploys.
- Confirm R2 binding works.
- Confirm asset handling matches the current `wrangler.base.jsonc` behavior.

### Chat

Chat should be third because it is the most complex app.

Responsibilities:

- Vite/Cloudflare Worker deployment.
- Static assets.
- R2 uploads bucket.
- Durable Object namespace for sync.
- Durable Object migrations/classes.
- Browser Rendering binding.
- Required secrets like `OPENCODE_GO_API_KEY` and `UPLOAD_TOKEN_SECRET`.
- Auth dependency vars.

Validation goals:

- Confirm Durable Object async Worker binding works with the existing implementation.
- Confirm Browser Rendering binding is supported in the required form.
- Confirm secrets can be collected and bound safely.
- Confirm chat deploy no longer needs generated Wrangler config.

## CLI Responsibilities After Migration

The CLI should become thinner, not disappear.

It should keep doing Shedflare-specific product work:

- Initialize a local config file.
- Prompt for domain, owner email, OAuth IDs, and optional defaults.
- Validate required app configuration.
- Decide enabled apps.
- Compute app URLs and stage names.
- Provide `--yes`, `--json`, and non-interactive flows.
- Offer friendly error messages and next steps.
- Orchestrate app-specific deploy/test/dev commands.
- Avoid exposing users directly to all Alchemy details for common workflows.

It should stop doing generic infrastructure lifecycle work:

- Creating Cloudflare resources directly.
- Parsing Wrangler output.
- Persisting resource IDs.
- Generating `wrangler.jsonc` as primary deploy config.
- Implementing drift detection for generated config.

## Testing Strategy

Alchemy should make live integration tests a first-class part of Shedflare.

Use `alchemy/Test/Vitest` to deploy and destroy stacks in tests:

```ts
import { afterAll, beforeAll, deploy, destroy, expect, test } from "alchemy/Test/Vitest";
import * as Effect from "effect/Effect";
import Stack from "../alchemy.run";

const stack = beforeAll(deploy(Stack));
afterAll.skipIf(!process.env.CI)(destroy(Stack));

test(
  "worker is reachable",
  Effect.gen(function* () {
    const { url } = yield* stack;
    const response = yield* HttpClient.get(url);
    expect(response.status).toBe(200);
  }),
);
```

Priority tests:

- Auth smoke test: deployed Worker responds and persists through KV.
- Drive smoke test: file metadata round-trips through D1 and object bytes round-trip through R2.
- Chat smoke test: uploads bucket works and sync Durable Object responds.
- Suite smoke test: auth URL is wired into chat and drive config.

Local behavior can keep resources around for fast iteration. CI should destroy preview/test stages automatically.

## CI And Preview Environments

Alchemy stages map naturally to Shedflare environments:

- `prod` for main deployment.
- `pr-<number>` for pull request previews.
- `test-<id>` or CI-provided stage for isolated integration tests.
- local default stages for development.

Future CI can use:

```sh
alchemy deploy --stage pr-123
alchemy destroy --stage pr-123
```

Alchemy can also manage GitHub preview comments and Cloudflare CI API tokens later. That should be a second phase after app deployment is working.

## Migration Phases

### Phase 1: Auth Spike

Goal: prove the basic architecture with the smallest app.

Tasks:

- Add Alchemy dependencies.
- Create `apps/auth/alchemy.run.ts`.
- Define the auth Worker and KV namespace.
- Replace auth deploy path with Alchemy deploy.
- Add a minimal live smoke test.
- Verify repeated deploy is idempotent.
- Verify destroy removes resources safely.

Exit criteria:

- Auth can be deployed without generated `wrangler.jsonc`.
- Auth can be tested against live Cloudflare resources.
- No runtime rewrite to Effect is required.

### Phase 2: Drive Migration

Goal: validate Vite, assets, D1 migrations, and R2.

Tasks:

- Create `apps/drive/alchemy.run.ts`.
- Use `Cloudflare.Vite` or `Cloudflare.Worker` plus assets, depending on which fits the current app best.
- Define D1 database with `migrationsDir`.
- Define R2 bucket.
- Wire auth URL and owner vars from config/root stack.
- Replace `wrangler d1 migrations apply` with Alchemy-managed migrations.
- Add a Drive live smoke test.

Exit criteria:

- Drive deploys and applies migrations through Alchemy.
- Existing Vite+ workflow remains usable.
- R2 and D1 bindings work in production and tests.

### Phase 3: Chat Migration

Goal: validate complex bindings and secrets.

Tasks:

- Create `apps/chat/alchemy.run.ts`.
- Define R2 uploads bucket.
- Define Durable Object namespace/class binding.
- Verify Durable Object migration behavior.
- Verify Browser Rendering binding support.
- Define required secrets through Cloudflare Secrets Store where appropriate.
- Add a Chat live smoke test.

Exit criteria:

- Chat deploys without generated Wrangler config.
- Durable Object sync path works.
- Required secrets have a safe operator flow.
- Browser binding works or has a documented fallback.

### Phase 4: Root Suite Stack

Goal: make Shedflare deploy as a composed suite.

Tasks:

- Add root `alchemy.run.ts`.
- Compose auth, drive, and chat stacks.
- Wire `AUTH_ISSUER_URL` from auth output into drive/chat.
- Return all public app URLs as stack outputs.
- Add suite-level smoke test.

Exit criteria:

- One root deploy can deploy the full suite in dependency order.
- App outputs are visible to CLI and tests.
- Per-app deploy remains possible for development.

### Phase 5: CLI Rewrite

Goal: thin the CLI around Alchemy.

Tasks:

- Update `shedflare deploy` to invoke the relevant Alchemy stack/stage.
- Add or update `shedflare dev` around `alchemy dev`.
- Add `shedflare destroy` around `alchemy destroy`.
- Update `shedflare test` around app/suite integration tests.
- Keep `shedflare configure` focused on user intent config.
- Deprecate or remove `shedflare provision`.
- Replace config drift checks with stack/config validation.

Exit criteria:

- CLI no longer creates KV, D1, or R2 resources directly.
- CLI no longer needs to parse Wrangler provisioning output.
- Users still get a simple Shedflare-specific workflow.

### Phase 6: Cleanup

Goal: remove the old deployment architecture.

Tasks:

- Delete `packages/cli/src/core/provision.ts` once unused.
- Delete most or all direct Wrangler wrappers from `packages/cli/src/core/wrangler.ts` once unused.
- Delete generated `wrangler.jsonc` generation code if fully obsolete.
- Remove `wrangler.base.jsonc` files if no longer needed.
- Simplify app manifests or replace them with stack-local declarations.
- Update docs and examples.

Exit criteria:

- Alchemy is the only supported deployment lifecycle for Shedflare apps.
- Wrangler config generation is gone or clearly marked as legacy.
- The repo has fewer deployment abstractions than before.

## Open Questions To Verify

These are not blockers to the direction, but they should be answered during the spike phases.

- Does Alchemy support custom domains/routes exactly as Shedflare needs for `auth`, `chat`, and `drive` subdomains?
- Does the Browser Rendering binding work with `Cloudflare.Worker` in the exact shape chat needs?
- Does `Cloudflare.Vite` integrate cleanly with Vite+ and the existing Cloudflare Vite plugin configuration?
- Should secrets live in Cloudflare Secrets Store, Worker secrets, or remain operator-managed values depending on the secret?
- Can existing deployed resources be adopted into Alchemy state, or should this be a breaking redeploy migration?
- How should local development stage naming avoid accidental collision with production resources?
- Do app manifests remain useful as metadata, or should Alchemy stacks become the sole source of app infrastructure truth?

## Likely Breaking Changes

This migration may intentionally break compatibility with existing provisioned resources.

Because Shedflare is still early and personal/self-hosted, it may be better to accept a clean migration than to preserve a complex compatibility layer.

Potential breaking changes:

- Existing `shedflare.config.jsonc` resource ID fields may become obsolete.
- Existing generated `wrangler.jsonc` files may be removed.
- Existing Cloudflare resources may need to be recreated under Alchemy-managed names/stages.
- Deployment commands may change behavior around stages and teardown.

If preserving existing resources is required, add an explicit adoption/import phase. Do not silently maintain two deployment models.

## Guiding Principles

- Prefer one deployment lifecycle over two.
- Keep Shedflare-specific UX in the CLI.
- Keep generic cloud lifecycle in Alchemy.
- Do not rewrite runtime app code to Effect just to migrate infrastructure.
- Use Effect in stack/test code where Alchemy expects it.
- Make live tests valuable enough to justify their cost.
- Avoid long-term compatibility shims unless real users need them.
- Delete old provisioning code once the Alchemy path reaches parity.

## Final Position

The possibility is too strong to ignore.

The goal should not be to wrap Alchemy inside the current CLI provisioning model. The goal should be to invert the architecture: Alchemy becomes the substrate for each app and the whole suite, while `shedflare` becomes a focused helper for configuring and orchestrating that substrate.

If the auth and drive spikes confirm the provider details, Shedflare should commit to the Alchemy-first path and remove the old Wrangler-generation architecture rather than carrying both indefinitely.
