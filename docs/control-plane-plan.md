# Shedflare Control Plane Plan

## Decision

Shedflare should become a forkable, agent-friendly personal software workshop for
Cloudflare.

The source repository remains the product: people clone or fork it, choose the
applications they want, deploy them to their own Cloudflare account, and then ask
coding agents to reshape the source around their lives. Shedflare is not primarily
an npm-distributed application suite, a hosted SaaS, or a fixed catalog of finished
products.

The local Console should become Shedflare's control plane. It should guide setup,
edit declarative intent, orchestrate shared headless operations, inspect Cloudflare,
and explain the state of the suite. It should not absorb application domain logic
or become a second source of truth.

The intended lifecycle is:

```text
Fork or clone
    -> run setup
    -> select apps and provide credentials in the Console
    -> review and deploy
    -> operate and inspect the suite in the Console
    -> customize source with an agent
```

## Product Position

Recommended description:

> Shedflare is a forkable, agent-friendly personal software suite for Cloudflare.
> Start with the applications you want, deploy them to your account, then reshape
> the source around your life with a coding agent.

This position has several consequences:

- Git is the source distribution and customization mechanism.
- The suite is intentionally single-owner; multi-user SaaS concerns remain out of
  scope.
- Applications may be stable, beta, experimental, or archived. The repository does
  not pretend every idea is maintained equally.
- Agent legibility is a product feature, not merely contributor documentation.
- The platform should make application selection, credentials, deployment, health,
  backups, and removal understandable before agent customization begins.

## Responsibility Boundary

The Console should orchestrate Shedflare; it should not run Shedflare.

```text
Console UI ----\
                -> headless operations layer -> filesystem / Alchemy / Cloudflare
CLI -----------/
```

### The Console owns the user experience for

- First-run onboarding.
- Connecting and validating a Cloudflare account.
- Domain and stage selection.
- Browsing the app catalog and understanding app maturity.
- Selecting, configuring, deploying, and removing apps.
- Secret presence, guided credential setup, validation, and rotation.
- Deployment progress, revision visibility, health, and drift.
- Backup, export, and restore entry points where apps support them.
- Links to deployed apps.
- Preparing context and recipes for coding-agent customization.

### The Console does not own

- Money's budgeting rules, Chat's model execution, or any other app domain logic.
- App databases or copies of app data.
- A private configuration database.
- A second app registry separate from app manifests.
- Permanent copies of Cloudflare inventory that can be discovered.
- Deployment implementations that differ from the CLI implementation.
- Hidden changes that cannot be inspected or reproduced headlessly.

## Sources of Truth

Shedflare must explicitly separate desired, secret, and observed state.

| State                      | Source of truth                 | Console responsibility                   |
| -------------------------- | ------------------------------- | ---------------------------------------- |
| Desired installation       | `shedflare.config.jsonc`        | Edit, explain, and validate              |
| Available applications     | App manifests                   | Discover and present                     |
| Infrastructure definitions | Alchemy stacks                  | Invoke through shared operations         |
| Operator secrets           | Cloudflare Worker secrets       | Set, validate, rotate, and show presence |
| Local-development secrets  | Gitignored local secret storage | Create and explain                       |
| Deployed resources         | Cloudflare and Alchemy state    | Discover and compare                     |
| Source revision            | Git                             | Display and attach to deployments        |
| App behavior and data      | Individual apps                 | Link to app-owned operations             |

The Console is a graphical editor over files and a live view over Cloudflare. It
must not create another authoritative database.

## Configuration Direction

`shedflare.config.jsonc` remains useful, but hand-editing it is no longer the
primary onboarding experience. It becomes:

- The durable description of user intent.
- A reproducible, reviewable output of the setup flow.
- A power-user interface.
- An agent interface.
- A non-interactive deployment input.

The desired shape should be sparse and based on installed-app presence:

```jsonc
{
  "$schema": "./packages/shedflare-core/schemas/shedflare-config.schema.json",
  "domain": "example.com",
  "ownerEmail": "you@example.com",
  "apps": {
    "auth": {},
    "homepage": {},
    "chat": {
      "provider": "opencode-go",
      "defaultModel": "auto",
    },
    "drive": {},
  },
}
```

Deployment stage is deliberately not committed in the shared config. It is chosen
per deployment or persisted as a local Console preference so one desired-state file
can serve production and temporary stages.

Rules:

- Presence means installed; avoid an additional `enabled: true` state unless a
  real use case requires installed-but-disabled.
- Defaults live in app definitions, so the file records deviations rather than
  boilerplate.
- Secrets never appear as values in this file.
- Physical resource IDs and deployment timestamps do not appear in this file.
- All writes preserve JSONC comments and formatting when practical.
- A generated JSON Schema provides editor completion and validation.

Existing config should be migrated rather than abruptly discarded. The migration
should be automatic, previewable, and reversible through source control.

## Application Contract

Each application should be an independently understandable source capsule:

```text
apps/<id>/
  README.md
  AGENTS.md
  shedflare.app.jsonc
  package.json
  alchemy.run.ts
  src/
  drizzle/             # when applicable
  tests/               # or colocated tests
```

The manifest should eventually describe:

- ID, name, description, and lifecycle status.
- Whether the app is selected by default.
- Dependencies, such as Auth.
- Cloudflare capabilities and resources.
- Non-secret configuration fields and defaults.
- Credential requirements and conditional requirements.
- Validation capabilities: check, test, build, e2e, live smoke test.
- Operational capabilities: health, backup, export, restore, destroy.
- Data sensitivity and destructive-operation warnings.
- Relevant documentation and customization recipes.

Suggested lifecycle vocabulary:

- `stable`: trusted with important personal data and covered by the stable app
  contract.
- `beta`: actively used but still changing or missing part of the operational
  contract.
- `experimental`: incomplete, exploratory, or safe to abandon.
- `archived`: retained as source material and not offered for normal installation.

The Console and generated documentation must show these statuses honestly.

## Onboarding Experience

Running `pnpm setup` should start the local Console and open `/setup`. If no config
exists, the normal Console entry point should redirect there.

### Step 1: Connect Cloudflare

- Collect or discover authentication through the safest supported mechanism.
- Test access immediately.
- Explain and validate the minimum permissions.
- Discover account and zone information instead of asking users to copy IDs.
- Keep credentials on the local machine except when explicitly setting a Worker
  secret.

### Step 2: Choose a domain and stage

- List available Cloudflare zones.
- Allow `workers.dev` as a low-friction starting option if supported by the stacks.
- Explain production and temporary stages in plain language.
- Preview derived app URLs.

### Step 3: Choose applications

- Present a catalog driven by manifests.
- Show purpose, lifecycle status, data sensitivity, required services, and required
  credentials.
- Select required dependencies automatically.
- Do not show configuration for unselected apps.

### Step 4: Configure selected applications

- Ask only for meaningful deviations from defaults.
- Reveal provider-specific fields conditionally.
- Generate internal signing secrets automatically.
- For third-party credentials, explain why they are needed, where to obtain them,
  exact permissions, storage destination, and how to test them.
- For OAuth applications, provide calculated callback URLs, copy actions, direct
  provider links, and validation before continuing.
- Permit "configure later" when an app can deploy safely without the credential.

### Step 5: Review

Show:

- Domain, stage, owner identity, and selected apps.
- Final app URLs.
- Cloudflare resources that will be created.
- Secrets that are present, missing, or generated, never their values.
- The exact config diff.
- Any experimental-app or destructive-operation warnings.

### Step 6: Deploy and verify

- Stream understandable progress per app and resource.
- Surface actionable errors rather than raw subprocess output alone.
- Attach Git revision and build time to deployed Workers.
- Run health checks after deployment.
- Finish with links to installed apps and suggested customization prompts.

Every interactive operation must also have a non-interactive equivalent for CI,
scripts, and agents.

## Shared Operations Layer

Console routes, CLI commands, and root scripts currently risk becoming separate
implementations. Extract a headless operations package before expanding the UI too
far.

Suggested package:

```text
packages/shedflare-core/
  config/
  manifests/
  inventory/
  credentials/
  deployment/
  health/
  backups/
  git/
```

It should expose typed operations such as:

- Load, validate, migrate, and patch config.
- Discover and validate manifests.
- Resolve app dependencies and deployment order.
- Inspect credential presence without reading secret values back.
- Generate internal secrets.
- Discover Cloudflare resources and stages.
- Plan, deploy, destroy, and health-check selected apps.
- Compare repository revision with deployed revision.
- Trigger app-declared backup/export/restore operations.

The Console server should be a thin HTTP adapter over these operations. The CLI
should call the same operations. Alchemy stacks remain the infrastructure source of
truth.

Long-running operations should return structured events so both interfaces can
render progress without parsing human-oriented terminal output.

## Credentials Model

Credential setup is the hardest part of onboarding and deserves a first-class typed
model. A credential definition should be able to drive the Console, CLI, `doctor`,
and documentation:

```ts
interface CredentialDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly secret: boolean;
  readonly requiredWhen?: ConfigCondition;
  readonly obtainUrl?: string;
  readonly requiredPermissions?: readonly string[];
  readonly validate?: CredentialValidator;
}
```

Requirements:

- Secret values are never written to config, logs, command arguments, generated
  documentation, or deployment history.
- The UI distinguishes configured, missing, invalid, and not required.
- Automatically generated secrets are rotated through an explicit operation.
- Validation failures explain provider permissions and likely remediation.
- Local-development credential creation is separate and clearly labeled.

## Deployment and Revision Model

Internal apps do not need semantic versions merely to support CI or deployment.
Use build metadata instead:

- Git commit SHA.
- Build timestamp.
- Dirty-worktree marker where relevant.
- Alchemy stage.
- App ID.

The Console should show repository versus deployed state:

| App      | Lifecycle    | Selected | Repository | Deployed     | Health  |
| -------- | ------------ | -------- | ---------- | ------------ | ------- |
| Money    | stable       | yes      | `09fa844`  | `b386183`    | healthy |
| Chat     | beta         | yes      | `09fa844`  | `209fabe`    | healthy |
| Routines | experimental | no       | `09fa844`  | not deployed | n/a     |

Deployment should be explicit and selectable:

```bash
pnpm deploy
pnpm deploy --app chat
pnpm deploy --apps auth,chat,drive
```

Production should not deploy automatically merely because `main` changed. A manual
GitHub workflow may expose stage and app selection once the headless operation is
stable.

## Continuous Integration

CI and releases should be separated. Remove app-version bumping if versions do not
serve an independent distribution or compatibility purpose.

Initial pull-request and main-branch CI should run the entire repository:

1. Install with the locked package manager.
2. Verify generated registries, schemas, and migration manifests are current.
3. Run formatting, linting, and type checking.
4. Run unit and integration tests that require no live account.
5. Build all supported apps.
6. Validate manifest, config, binding, and stack consistency.
7. Validate migration integrity.

Start boring and comprehensive. Add affected-package optimization only after CI
duration becomes a demonstrated problem.

Live Alchemy smoke tests and e2e environments should be separate manual, scheduled,
or explicitly labeled workflows because they require credentials and create real
resources.

## Agent-Native Customization

Agent support begins after installation, but the repository must prepare a clean
handoff.

Every stable app's `AGENTS.md` should state:

- Purpose and architecture.
- Important data flows and boundaries.
- Schema and migration ownership.
- Authentication rules.
- Domain invariants.
- Cloudflare resources.
- Safe customization points.
- Dangerous or destructive changes.
- Required validation commands.
- How to remove the app cleanly.

Add root recipes for common jobs:

```text
docs/agent-recipes/
  add-an-app.md
  remove-an-app.md
  customize-an-app.md
  add-a-secret.md
  change-domain.md
  change-storage.md
  prepare-a-deployment.md
```

After onboarding, generate a non-secret installation summary that an agent can
read. It should contain installed apps, domain, stage, provider selections, and
links to relevant recipes—but never credentials.

Shedflare should recommend selective upstream adoption rather than promise painless
permanent synchronization of deeply customized forks. Focused commits, isolated app
changes, generated registries, and platform/app boundaries make cherry-picking
practical.

## Repository Classification and Pruning

The repository should distinguish three conceptual layers:

1. Stable platform machinery.
2. Installable applications with declared lifecycle status.
3. Experiments that do not participate in the supported default experience.

This does not require immediately moving directories. Lifecycle metadata and CI
selection can establish the distinction first. A later move to `experiments/` is
reasonable if it materially improves discovery and tooling.

Apply a strict test to shared packages: at least two real consumers or a compelling
platform boundary. In particular:

- Adopt `@shedflare/ui` in real apps or reduce its scope.
- Complete genuine shared sync-protocol adoption or return it to its primary app.
- Choose one supported CLI/control-plane direction and retire redundant interfaces.
- Give Observability an authenticated review workflow or stop retaining sensitive
  error data.
- Remove stale plans, deprecated re-exports, and generated archives when they no
  longer help current work.

Agents treat repository artifacts as evidence. Misleading files impose a real
product cost.

## Delivery Phases

### Phases 0–1: Control plane foundation

Deliverables:

- Adopt this direction as the active product and command-surface plan.
- Define lifecycle statuses and classify every app.
- Document the desired/secret/observed state boundary.
- Extract config and manifest operations into a shared core package.
- Generate and validate the typed app registry.
- Add JSON Schema for config.
- Add config migration and comment-preserving patch support.
- Resolve app dependencies and defaults from manifests.

Exit criteria:

- Console and CLI can list the same apps from the same source.
- A config can be created, migrated, validated, and patched without UI code.
- CI can detect manifest/registry/config drift.
- Every app has an honest status and contributors can identify the supported setup
  and deployment path.

Detailed implementation plan: `docs/control-plane-foundation-plan.md`.

### Phase 2: Setup wizard without deployment

Deliverables:

- Add `/setup` and missing-config redirect behavior.
- Implement domain, owner, stage, app selection, app configuration, and review.
- Preview and write the config only after confirmation.
- Run `doctor` and show actionable results.

Exit criteria:

- A new user can produce a valid minimal config without editing JSONC.
- Unselected apps never request configuration.
- The generated diff is reviewable and reproducible headlessly.

### Phase 3: Credentials

Deliverables:

- Add typed credential definitions.
- Show Cloudflare credential permission guidance and connection validation.
- Implement secret presence, set, validate, generate, and rotate operations.
- Add guided OAuth callback setup.
- Add non-interactive CLI equivalents.

Exit criteria:

- A selected app can reach a deploy-ready credential state through the Console.
- Secret values never enter config or logs.
- Credential status is understandable without revealing values.

### Phase 4: Deployment and health

Deliverables:

- Extract structured deployment operations shared by Console and CLI.
- Add deployment review and streamed progress.
- Embed Git/build metadata.
- Add post-deploy health checks and app links.
- Add repository-versus-deployed revision comparison.

Exit criteria:

- A new fork can go from setup to healthy deployed apps through the Console.
- The same deployment can be performed non-interactively.
- The Console can explain what is deployed and from which revision.

### Phase 5: CI and operational contract

Deliverables:

- Add repository-wide CI without semantic app-version bumping.
- Add generated-artifact and migration checks.
- Define health, backup, export, restore, and destroy capabilities in manifests.
- Surface supported operations in the Console.

Exit criteria:

- Pull requests cannot merge with ordinary check/test/build drift.
- Stable data-bearing apps meet the declared safety contract.
- Live-resource tests remain clearly separated from ordinary CI.

### Phase 6: Agent handoff and consolidation

Deliverables:

- Add app-specific agent guidance and root recipes.
- Generate a non-secret installation summary.
- Add customization prompts to the Console.
- Migrate or reduce speculative shared abstractions.
- Archive or remove misleading repository artifacts.

Exit criteria:

- A coding agent can safely customize or remove one app using bounded context.
- The repository no longer presents abandoned experiments as supported products.
- Shared packages have demonstrated consumers and clear ownership.

## Immediate Next Slice

The first implementation should remain intentionally narrow:

1. Add lifecycle status and configuration-field metadata to app manifests.
2. Extract read-only manifest discovery from the Console server into a shared core
   module.
3. Add `/setup` with app selection and config preview.
4. Write `shedflare.config.jsonc` only after explicit confirmation.
5. Run the existing config validation and present its result.

Do not include Cloudflare login, secret mutation, or deployment in this first slice.
It proves the source-of-truth and UI boundaries before adding risky operations.

## Success Measures

The direction is working when:

- A newcomer reaches a valid configuration without reading the config template.
- They only see questions relevant to selected apps.
- They can explain where secrets and deployed state live.
- Console and CLI produce the same plans and outcomes.
- The Console identifies deployment revision and health without package versions.
- Experimental work can remain unfinished without confusing the supported path.
- An agent can customize one app without loading the entire monorepo.
- Stable data-bearing apps have visible backup and recovery paths.

## Non-Goals

- Turning Shedflare into a hosted multi-user SaaS.
- Publishing every app as an independently versioned npm package.
- Hiding the source repository behind an installer.
- Guaranteeing conflict-free upstream merges for heavily customized forks.
- Building an embedded coding agent before the external-agent handoff is excellent.
- Making application domain settings live in the Console.
- Achieving provider neutrality at the expense of useful Cloudflare integration.
