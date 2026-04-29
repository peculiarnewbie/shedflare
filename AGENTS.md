# Shedflare – Agent Guidance

## This is a personal suite, not a multi-user SaaS

Shedflare is a **self-hosted suite of personal productivity tools** meant to be deployed by a single person for their own use. There are no "users," no sign-up flow, no tenant isolation, and no per-user settings that differ from the deployment owner's preferences.

- Auth exists solely to protect the deployment from public access — it gates the owner's own sessions, not a user base.
- API keys are the owner's keys.
- **Do not add multi-user features** unless explicitly requested.

## CLI Development

The `shedflare` CLI lives in `packages/cli` and is the primary user-facing tool. It is an npm-publishable package that helps users set up and deploy Shedflare apps to their Cloudflare account.

### Architecture

```
packages/cli/
  src/
    index.ts         # Entry point – commander routing
    commands/         # Command implementations (init, configure, doctor, etc.)
    core/             # Business logic (manifests, config, generation, provisioning)
    headless/         # Non-interactive prompt helpers
packages/cli-tui/
  src/
    index.ts         # OpenTUI interactive installer (stub – needs OpenTUI Node support)
```

### Design Rules

- **Business logic is UI-agnostic.** Commands and core modules must never import from any TUI package. The TUI is a separate package that calls core APIs.
- **App manifests** (`apps/*/shedflare.app.jsonc`) are the source of truth for what vars, secrets, and resources each app requires.
- **Wrangler configs** are generated output. Edit `apps/*/wrangler.base.jsonc` or `apps/*/shedflare.app.jsonc` instead.
- **Root `shedflare.config.jsonc`** stores the user's deployment values (domains, emails, provisioned resource IDs). It is gitignored. `shedflare.config.example.jsonc` is the committed template.
- **Every interactive prompt must have a non-interactive flag equivalent** for CI and scripting (`--yes`, `--json`, etc.).
- **Config drift detection** is enforced via `shedflare configure --check`, which must be part of the root `check` script.

### Adding a New App

1. Create `apps/<name>/`.
2. Add `apps/<name>/shedflare.app.jsonc` with the app manifest.
3. Add `apps/<name>/wrangler.base.jsonc` with the stable Wrangler config structure.
4. Add `apps/<name>/.dev.vars.example` with required secrets.
5. Register the app ID in `packages/cli/src/core/manifests.ts` type union.
6. Add a deploy script in the app's `package.json`.
7. Add root convenience scripts in the root `package.json`.
8. Run `shedflare doctor` to validate.

### CLI vs TUI

- `shedflare` (packages/cli) always works headlessly or with simple prompts.
- `@shedflare/tui` (packages/cli-tui) provides a full-screen OpenTUI installer for interactive use. It is **currently a stub** and requires OpenTUI Node.js support to be functional.
- The main `shedflare` package should never hard-depend on `@shedflare/tui`. TUI should be auto-detected or explicitly requested.

### Drift Prevention

- `shedflare configure --check` validates generated configs against manifests and base configs.
- The root `check` script should include this check.
- CI should run `shedflare init --yes --mock-resources` into a temp dir to prove the user path still works.
- Every app change that touches bindings, vars, or resources must also update `shedflare.app.jsonc`.

## Using Vite+

The apps in this repo use Vite+. See `apps/chat/AGENTS.md` for detailed Vite+ workflow guidance.

Key rules:

- Use `vp <command>` instead of `pnpm exec` or direct tool calls.
- `vp check` runs format, lint, and TypeScript type checks.
- `vp test` runs tests.
- Do not install Vitest, Oxlint, Oxfmt, or tsdown directly.
