# Shedflare – Agent Guidance

## This is a personal suite, not a multi-user SaaS

Shedflare is a **self-hosted suite of personal productivity tools** meant to be deployed by a single person for their own use. There are no "users," no sign-up flow, no tenant isolation, and no per-user settings that differ from the deployment owner's preferences.

- Auth exists solely to protect the deployment from public access — it gates the owner's own sessions, not a user base.
- API keys are the owner's keys.
- **Do not add multi-user features** unless explicitly requested.

## Deployment (Alchemy)

**Alchemy** is the only supported deployment lifecycle. Each app has an Alchemy stack that declares its Cloudflare resources and wires them together. The root stack deploys the full suite.

### Architecture

```
alchemy.run.ts          # Root suite stack — composes all app stacks
packages/shedflare-alchemy/ # WorkerSecret provider, config loading, physical naming
infra/alchemy-env.ts # Deprecated re-exports; use @shedflare/alchemy
apps/*/
  alchemy.run.ts        # Per-app Alchemy stack (resource lifecycle + Worker deploy)
  alchemy.test.ts       # Live smoke tests (guarded by SHEDFLARE_LIVE_ALCHEMY_TESTS)
  shedflare.app.jsonc   # App manifest (vars, secrets, resource declarations)
  .dev.vars.example     # Local dev environment template
packages/cli/           # Shedflare CLI (init, configure, doctor — deprecated)
```

### Deploy Commands

| Command            | What it does                     |
| ------------------ | -------------------------------- |
| `pnpm deploy:auth` | Deploy auth app standalone       |
| `pnpm deploy`      | Deploy the full suite (all apps) |
| `pnpm destroy`     | Destroy the full suite           |
| `pnpm test:auth`   | Run auth live smoke test         |

### Design Rules

- **`shedflare.config.jsonc`** is the source of truth for deployment config (domain, email, app subdomains, secrets). It is gitignored. `shedflare.config.example.jsonc` is the committed template.
- **App manifests** (`apps/*/shedflare.app.jsonc`) declare what vars, secrets, and resources each app needs. Keep in sync with `alchemy.run.ts`.
- **Alchemy stacks** (`apps/*/alchemy.run.ts`) are the source of truth for Cloudflare resource declarations. If you modify a stack, run `pnpm deploy:<app>` to apply.
- **Root `alchemy.run.ts`** wires auth URL into all child apps. Update when adding a new app.
- **Non-secret config** (domain, vars like `DEFAULT_MODEL_ID`) goes in gitignored `shedflare.config.jsonc`. **Operator secrets** use `Shedflare.WorkerSecret` in Alchemy stacks (Cloudflare Worker is source of truth; set via `shedflare secret set` or env at deploy time). See `docs/operator-secrets.md`.
- **Every interactive prompt must have a non-interactive flag equivalent** for CI and scripting.
- **Run `shedflare doctor` to validate config** (deprecated CLI, but still works for validation).

### Adding a New App

1. Create `apps/<name>/`.
2. Add `apps/<name>/shedflare.app.jsonc` with the app manifest.
3. Add `apps/<name>/alchemy.run.ts` with the Alchemy stack (Worker, resources, bindings).
4. Add `apps/<name>/alchemy.test.ts` with a live smoke test.
5. Add `apps/<name>/.dev.vars.example` with required secrets.
6. Register the app ID in `infra/alchemy-config.ts` AppId type union.
7. Add `deploy:<name>` and `destroy:<name>` scripts to root `package.json`.
8. Update root `alchemy.run.ts` to compose the new stack.
9. Update `shedflare.config.example.jsonc` with new app entry.
10. Optionally register in `packages/cli/src/core/manifests.ts` type union if CLI tooling is still used.

### Schema Convention

For apps using SQLite (DO storage):

- **`src/db/schema.ts`** — Drizzle table definitions (single source of truth for types)
- **`src/server/schema.ts`** — Raw `CREATE TABLE IF NOT EXISTS` DDL strings

Both must be kept in sync. The DDL runs on DO cold start. Raw SQL is only for dynamic-table operations and DDL — all other queries should use Drizzle.

## TypeScript: No `as any` unless absolutely necessary

**Never use `as any` to silence type errors.** It erases compile-time safety and causes bugs like the drive 400 incident (schema mismatch hidden behind `any` cast). If a type doesn't fit, use proper generics, `unknown`, type assertions to the correct type, or `satisfies`. The only acceptable use is when interfacing with a library that has genuinely untyped APIs — and even then, wrap it in a typed helper so the `any` is contained.

## Using Vite+

The apps in this repo use Vite+. See `apps/chat/AGENTS.md` for detailed Vite+ workflow guidance.

Key rules:

- Use `vp <command>` instead of `pnpm exec` or direct tool calls.
- `vp check` runs format, lint, and TypeScript type checks.
- `vp test` runs tests.
- Do not install Vitest, Oxlint, Oxfmt, or tsdown directly.
