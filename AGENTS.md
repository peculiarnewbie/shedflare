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

| Command            | What it does                         |
| ------------------ | ------------------------------------ |
| `pnpm deploy:auth` | Deploy auth app standalone to `prod` |
| `pnpm deploy`      | Deploy the full suite to `prod`      |
| `pnpm destroy`     | Destroy the full `prod` suite        |
| `pnpm test:auth`   | Run auth live smoke test             |

### Console (Local Dashboard)

`packages/console/` is a local-only SolidJS SPA for managing the suite. It is **not** deployed to Cloudflare — it runs via `shedflare dashboard` or `pnpm --filter @shedflare/console dev`.

- **Stage discovery is automatic.** The console scans all Workers on the Cloudflare account, extracts stage names from the `shedflare-{stage}-{appId}` naming pattern, and populates a stage selector dropdown in the sidebar. No need to set `ALCHEMY_STAGE` beforehand.
- **Stage selection persists** in `localStorage` across sessions.
- **API endpoints:** `GET /api/stages` returns `{ stages: string[], currentStage: string }`. `GET /api/overview?stage=<name>` returns the suite overview for that stage.
- **The stage from `ALCHEMY_STAGE` env var is still honoured** if explicitly set — it becomes the default selection.

### Design Rules

- **`shedflare.config.jsonc`** is the gitignored desired-state source of truth. Version 2 is sparse: app presence means selected, and it stores only non-secret deviations from manifest defaults. `shedflare.config.example.jsonc` is the committed template.
- **App manifests** (`apps/*/shedflare.app.jsonc`) are the catalog source of truth. They declare lifecycle, category, data sensitivity, vars, secrets, and resources; keep deployment metadata in sync with `alchemy.run.ts`.
- **`@shedflare/core`** is the only implementation of manifest discovery, app identity, config validation, migration, config patching, and dependency ordering. Alchemy, the CLI, and the Console consume it; do not add a local manifest registry or config parser.
- **Alchemy stacks** (`apps/*/alchemy.run.ts`) are the source of truth for Cloudflare resource declarations. If you modify a stack, run `pnpm deploy:<app>` to apply to `prod`.
- **Production is the default supported deploy target.** Root deploy/destroy scripts pass `--stage prod`; use direct `vp exec alchemy ... --stage <name>` commands only for temporary or test stages.
- **Non-production stages use derived subdomains.** `prod` uses configured subdomains as-is; any other stage appends the sanitized stage, e.g. `chat` + `dev-bolt` becomes `chat-dev-bolt.example.com`.
- **Root `alchemy.run.ts`** wires auth URL into all child apps. Update when adding a new app.
- **Non-secret config** (domain and vars like `DEFAULT_MODEL_ID`) goes in gitignored `shedflare.config.jsonc`; secrets and physical Cloudflare resource IDs do not. **Operator secrets** use `Shedflare.WorkerSecret` in Alchemy stacks (Cloudflare Worker is source of truth; set via `shedflare secret set` or env at deploy time). See `docs/operator-secrets.md`.
- **Every interactive prompt must have a non-interactive flag equivalent** for CI and scripting.
- **Run `shedflare doctor` to validate local and deployed state.** Use `shedflare config migrate --write` for an explicit, backed-up version-1 migration.

### Adding a New App

1. Create `apps/<name>/`.
2. Add `apps/<name>/shedflare.app.jsonc` with the app manifest.
3. Add `apps/<name>/alchemy.run.ts` with the Alchemy stack (Worker, resources, bindings).
4. Add `apps/<name>/alchemy.test.ts` with a live smoke test.
5. Add `apps/<name>/.dev.vars.example` with required secrets.
6. Run `pnpm registry:generate` to update the generated `@shedflare/core` app ID type.
7. Add `deploy:<name>` and `destroy:<name>` scripts to root `package.json`.
8. Update root `alchemy.run.ts` to compose the new stack.
9. Update `shedflare.config.example.jsonc` with new app entry.
10. Run `pnpm contract:check`; it verifies generated files, manifests, and the example config.

### Schema Convention

For apps using SQLite (DO storage):

- **`src/db/schema.ts`** — Drizzle table definitions (single source of truth for types and DDL)
- **`drizzle/migrations/`** — Migrations generated by `drizzle-kit generate` from `src/db/schema.ts`
- **`drizzle/migrations/index.ts`** — Auto-generated manifest consumed by `drizzle-orm/durable-sqlite/migrator` (regenerate with `pnpm db:generate`)

Do not write raw `CREATE TABLE` strings in TypeScript. Run `pnpm db:generate` after changing `src/db/schema.ts`, commit the generated migration files, and run migrations inside `ctx.blockConcurrencyWhile()` before any query. All queries must use Drizzle; raw SQL is only for dynamic-table operations.

## TypeScript: No `as any` unless absolutely necessary

**Never use `as any` to silence type errors.** It erases compile-time safety and causes bugs like the drive 400 incident (schema mismatch hidden behind `any` cast). If a type doesn't fit, use proper generics, `unknown`, type assertions to the correct type, or `satisfies`. The only acceptable use is when interfacing with a library that has genuinely untyped APIs — and even then, wrap it in a typed helper so the `any` is contained.

## Using Vite+

The apps in this repo use Vite+. See `apps/chat/AGENTS.md` for detailed Vite+ workflow guidance.

Key rules:

- Use `vp <command>` instead of `pnpm exec` or direct tool calls.
- `vp check` runs format, lint, and TypeScript type checks.
- `vp test` runs tests.
- Do not install Vitest, Oxlint, Oxfmt, or tsdown directly.
