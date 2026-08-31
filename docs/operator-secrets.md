# Operator Secrets & Config Design

Design doc for how Shedflare handles deployment config and secrets on Alchemy.
The implementation is now in `packages/shedflare-alchemy`; this document is
retained as the design record. For current operational commands, see
[`README.md`](../README.md) and [`AGENTS.md`](../AGENTS.md).

## Problem

Shedflare is mid-migration to Alchemy. Config and secrets are split across several
systems that disagree:

| System                  | File / mechanism                       | Used by                                          |
| ----------------------- | -------------------------------------- | ------------------------------------------------ |
| CLI init                | `shedflare.config.jsonc`               | `shedflare init`, `doctor`, `configure`          |
| Alchemy stacks (actual) | `shedflare.config.jsonc` + environment | `apps/*/alchemy.run.ts` via `@shedflare/alchemy` |
| App manifests           | `apps/*/shedflare.app.jsonc`           | Core catalog consumed by Alchemy and the CLI     |
| Per-app deployment docs | `apps/*/docs/deployment.md`            | Alchemy deployment guides                        |

Additionally:

- `secretEnv()` in `infra/alchemy-env.ts` requires secrets in `.env` on **every** deploy.
- `shedflare init` prompts for secrets but does not persist them (no `putSecret` call).
- `shedflare doctor` checks secrets against the physical Worker name; it does not
  require an app-local `wrangler.jsonc`.
- Expecting people to put secrets in plain config files is not acceptable.

## Goals

1. **No secrets in committed or gitignored config files** for deploy (`shedflare.config.jsonc`
   holds domain, email, enabled apps, non-secret vars only).
2. **Cloudflare Worker is the source of truth** for operator-provided secret values
   (wrangler-style persistence).
3. **Prompt once, deploy many** — subsequent deploys must not require local secret files.
4. **Shedflare wraps Alchemy** — CLI owns UX (prompts, validation); Alchemy owns infra.
5. **Secrets Store is out of scope for v1** — worker script secrets API only; pluggable
   backend later.

## Non-goals (v1)

- Cloudflare Secrets Store (`Cloudflare.SecretsStore`) — add later as alternate backend.
- Replacing `shedflare.config.jsonc` with `.env` for non-secrets — config file stays
  the source of truth for user intent (domain, apps, subdomains).
- Custom Alchemy state store — Alchemy state is for the resource graph, not secret values.

---

## Verified behavior (live test, May 2026)

Script: [`scripts/verify-secret-inherit.mts`](../scripts/verify-secret-inherit.mts)  
Fixture: [`scripts/secret-inherit-verify/`](../scripts/secret-inherit-verify/)

| Step      | Action                                              | Result                                |
| --------- | --------------------------------------------------- | ------------------------------------- |
| Deploy #1 | Include `TEST_SECRET` in Worker `env` as `Redacted` | Secret on CF ✓, runtime works ✓       |
| Deploy #2 | Omit `TEST_SECRET` from Worker `env` entirely       | Secret still on CF ✓, runtime works ✓ |

**Conclusion:** Omitting operator secrets from the Worker `env` block does **not** remove
bindings already on Cloudflare. Pattern B (CF as authority, omit on redeploy) is viable.

**Separate issue:** `secretEnv()` still throws at stack evaluation time if no local value
exists — even when CF already has the secret. Stacks must stop using bare `secretEnv()`
for operator secrets.

---

## Three kinds of values

| Kind                | Examples                                                       | Mechanism                                               | On disk?                           |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------- |
| **Config**          | `domain`, `ownerEmail`, `DEFAULT_MODEL_ID`, `GOOGLE_CLIENT_ID` | `shedflare.config.jsonc` → `Alchemy.Variable` on Worker | Gitignored config only; no secrets |
| **Operator secret** | `OPENCODE_GO_API_KEY`, `CF_API_TOKEN`                          | `Shedflare.WorkerSecret` → CF Worker secrets API        | Never                              |
| **Auto secret**     | `UPLOAD_TOKEN_SECRET`, `SYNC_SECRET`                           | `Alchemy.Random` → `WorkerSecret` (push once)           | Never (value in Alchemy state)     |

---

## Core abstraction: `Shedflare.WorkerSecret`

A custom Alchemy **Resource** (with **provider**), not an Action or state store.

Conceptually: **`Alchemy.Secret` that checks the deployed Worker before requiring a
local value.**

### `Alchemy.Secret` today

```
Config.redacted("NAME")
  → read .env / process.env at deploy time
  → push as secret_text on Worker
  → fail if missing locally
```

Never asks Cloudflare whether the binding already exists.

### `Shedflare.WorkerSecret` (proposed)

```
1. read:   GET /workers/scripts/{workerName}/secrets  → binding present?
2. reconcile:
     if props.value provided     → PUT (first deploy / rotation)
     else if present on CF       → noop
     else if required            → fail with actionable message
3. delete: optional — remove binding on stack destroy (TBD policy)
```

Operator secrets are **not** placed in the Worker `env` block. They are managed via the
CF secrets API as separate resources that depend on the Worker existing first.

### Resource shape (sketch)

```typescript
export type WorkerSecret = Resource<
  "Shedflare.WorkerSecret",
  {
    workerName: Output<string>;
    binding: string;
    value?: Redacted.Redacted<string>;
    required?: boolean;
  },
  {
    binding: string;
    present: boolean;
  }
>;
```

### Stack usage (sketch)

```typescript
const worker =
  yield *
  Cloudflare.Worker("ChatWorker", {
    name: physicalName(stage, "chat"),
    main: "apps/chat/src/worker.ts",
    env: {
      APP_PUBLIC_URL: config.url,
      OWNER_EMAIL: config.ownerEmail,
      DEFAULT_MODEL_ID: config.defaultModelId,
      // no operator secrets here
    },
    // ...
  });

yield *
  WorkerSecret("OpencodeKey", {
    workerName: worker.workerName,
    binding: "OPENCODE_GO_API_KEY",
    value: yield * optionalSecretConfig("OPENCODE_GO_API_KEY"),
    required: true,
  });

yield *
  WorkerSecret("UploadToken", {
    workerName: worker.workerName,
    binding: "UPLOAD_TOKEN_SECRET",
    value: (yield * Alchemy.Random("UPLOAD_TOKEN_SECRET")).text,
  });
```

Dependency graph:

```
ChatWorker ──► WorkerSecret(OpencodeKey)
          └──► WorkerSecret(UploadToken)
```

---

## Why Resource, not Action or custom state store

| Primitive                      | Verdict         | Reason                                                                      |
| ------------------------------ | --------------- | --------------------------------------------------------------------------- |
| **Custom Resource + provider** | ✓ Use           | Secrets on a Worker are cloud entities with observe/create/update lifecycle |
| **Action**                     | ✗ Primary model | Hash-based skip; no `read`; no delete lifecycle; wrong for "already on CF"  |
| **Custom state store**         | ✗               | Stores Alchemy's deployment graph, not CF secret values                     |

Actions remain appropriate for one-off deploy hooks (smoke tests, notifications), not
secret lifecycle.

Reference: [Alchemy Resource](https://v2.alchemy.run/concepts/resource/),
[Custom provider guide](https://v2.alchemy.run/guides/custom-provider/).

---

## CLI role (thin wrapper)

The CLI does **not** put secret values in Shedflare or Alchemy state. Remote
commands use the same Cloudflare API and persisted Alchemy profile as the
`WorkerSecret` provider.

### `shedflare deploy [app]`

```
1. Load shedflare.config.jsonc (non-secrets only)
2. Invoke Alchemy with an explicit empty env file, preventing its default `.env` load
3. WorkerSecret checks the deployed Worker for each declared binding
4. Existing remote binding → noop
5. Missing required binding → fail with `shedflare secret set` guidance
6. Explicit process environment / deprecated --secret value → rotate remotely
7. finally: delete any CLI-injected secret keys from process.env
```

Set once with `shedflare secret set`, then deploy repeatedly with no local copy.

### `shedflare secret set <app> <NAME>`

Calls the same CF API as the WorkerSecret provider, authenticated through the
Alchemy Cloudflare profile:

```bash
shedflare secret set chat OPENCODE_GO_API_KEY
```

The default destination is the remote Worker. `--local` writes only the ignored
repository `.env`; `--both` is the explicit opt-in to update both destinations.

### `shedflare secret list <app>` / `shedflare doctor`

Compare manifest `apps/*/shedflare.app.jsonc` secret declarations against CF binding
names (not values). Target worker name from `physicalName(stage, appId)`.

### Local dev (separate path)

Deploy and dev differ:

|         | Deploy             | Local dev                          |
| ------- | ------------------ | ---------------------------------- |
| Secrets | CF Worker bindings | repository `.env` (gitignored)     |
| Command | `shedflare deploy` | `shedflare dev` / `pnpm dev:<app>` |

---

## Config boundary

### `shedflare.config.jsonc` (gitignored, example committed)

```jsonc
{
  "domain": "example.com",
  "ownerEmail": "you@example.com",
  "apps": {
    "auth": { "enabled": true, "subdomain": "auth" },
    "chat": { "enabled": true, "subdomain": "chat" },
  },
  "vars": {
    "chat": {
      "DEFAULT_MODEL_ID": "auto",
    },
  },
}
```

No secret values. No empty-string placeholders for API keys.

### `apps/*/shedflare.app.jsonc` (committed, schema only)

Declares **what** secrets exist, not values:

```jsonc
"secrets": {
  "OPENCODE_GO_API_KEY": {
    "description": "OpenCode Go API key",
    "required": true,
    "source": "operator"
  },
  "UPLOAD_TOKEN_SECRET": {
    "description": "Signing key for upload URLs",
    "required": true,
    "source": "auto"
  }
}
```

Consumed by WorkerSecret declarations, CLI prompts, and doctor — single schema.

### Wire `appConfig()` to config file

Alchemy stacks now load non-secrets from `shedflare.config.jsonc` through
`@shedflare/alchemy`. The old `infra/alchemy-config.ts` compatibility module has
been retired; `infra/alchemy-env.ts` remains only as a deprecated compatibility
layer until its final consumer migrates.

---

## Secrets Store (future)

When added, introduce a second resource or a `backend` prop:

```jsonc
"source": "operator",
"backend": "worker"   // default
"backend": "store"    // future — Cloudflare.SecretsStore
```

CLI `secret set` and stacks stay stable; only the provider backend changes.

---

## Package layout (planned)

```
packages/shedflare-alchemy/
  WorkerSecret.ts           # Resource type + CF secrets API provider
  config.ts                 # load shedflare.config.jsonc
  optionalSecretConfig.ts   # Config.redacted, optional (push/rotate only)
  providers.ts              # Shedflare.providers()
  index.ts

packages/cli/
  commands/deploy.ts        # prompt → process.env → alchemy deploy
  commands/secret.ts        # secret set / list

scripts/
  verify-secret-inherit.mts           # regression test for omit behavior
  secret-inherit-verify/              # minimal fixture worker
```

Root stack respects `enabled: false` in config (separate follow-up).

Per-app `docs/deployment.md` files should be rewritten or replaced by a single
`docs/FORK.md` once this lands.

---

## Implementation order

1. `packages/shedflare-alchemy` — `WorkerSecret` provider + tests (mock CF API)
2. Wire `loadAppConfig()` from `shedflare.config.jsonc`
3. Migrate `apps/chat/alchemy.run.ts` as vertical slice
4. `shedflare secret set` / `list` + `deploy` wrapper
5. Migrate remaining app stacks
6. Remove `secretEnv()` / `.env` guidance for deploy; update AGENTS.md and README
7. Optional: add live test to `scripts/verify-secret-inherit.mts` in CI (guarded)

---

## Open questions

- **Destroy policy:** Should `WorkerSecret` delete bindings on `alchemy destroy`, or
  leave secrets on the Worker script?
- **Stage naming:** Public deploy scripts use `--stage prod`. Temporary stages
  should be explicit direct Alchemy commands, for example `--stage dev-bolt`.
- **Browser binding (chat):** Still manual post-deploy until Alchemy supports it.
- **Upstream Alchemy:** Consider contributing `keep_bindings` for secrets or a
  first-class "inherit existing secret" binding if WorkerSecret provider proves fragile.

---

## Summary

| Do                                         | Don't                                        |
| ------------------------------------------ | -------------------------------------------- |
| `Shedflare.WorkerSecret` custom Resource   | Secrets in `shedflare.config.jsonc`          |
| `Alchemy.Variable` for config vars         | `secretEnv()` requiring `.env` every deploy  |
| `Alchemy.Random` for auto secrets          | Custom Alchemy state store for secret values |
| `secret set` defaults to the remote Worker | Implicitly mirror production into `.env`     |
| Explicit process env → deploy → clear      | Read repository `.env` during deployment     |
| CF Worker as authority for "already set"   | Secrets Store in v1                          |

**One line:** A version of `Alchemy.Secret` that treats the deployed Worker as the
authority for operator secrets, and local env as "new value to push."
