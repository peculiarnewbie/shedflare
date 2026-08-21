# Shedflare

Shedflare is a family of self-hosted personal productivity tools for Cloudflare. Each app is a
standalone Worker deployed to your own Cloudflare account via [Alchemy](https://alchemy.run). This
repository is the optional suite orchestrator and a temporary compatibility snapshot of app source.

> [!NOTE]
> Shedflare is moving toward independently installable app repositories, with the suite becoming an
> optional orchestration layer. See [ADR 0001](docs/architecture/0001-standalone-first-repositories.md)
> for the accepted direction and migration gates.

## Contributor Workspace

Changes that span Shedflare repositories use sibling checkouts, not a combined package-manager
workspace. Create the local umbrella layout used by the maintainers:

```bash
mkdir shedflare
git clone https://github.com/shedflare/shedflare.git shedflare/shedflare
cd shedflare/shedflare
node scripts/setup-contributor-workspace.mjs
```

The setup command clones every standalone repository beside `shedflare/` and adds umbrella guidance:

```text
shedflare/
  AGENTS.md
  shedflare/
  packages/
  anki/
  auth/
  cf-bill/
  chat/
  discord/
  drive/
  homepage/
  links/
  money/
  observability/
  routines/
  site/
```

Use `--ssh` for SSH clone URLs or `--dry-run` to inspect the plan. Existing canonical clones are
reused, and conflicting directories stop setup without being changed. Install and test only the
repositories involved in your contribution; each remains independently installable and testable.

## Apps

The standalone repositories below are canonical. Copies under `apps/` remain frozen compatibility
snapshots until the suite consumes pinned releases.

| App           | Canonical repository                                                    | Description                                                        |
| ------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Anki          | [`shedflare/anki`](https://github.com/shedflare/anki)                   | Personal spaced-repetition cards and review                        |
| Auth          | [`shedflare/auth`](https://github.com/shedflare/auth)                   | OAuth2/OIDC authentication provider (OpenAuth)                     |
| CF Bill       | [`shedflare/cf-bill`](https://github.com/shedflare/cf-bill)             | Cloudflare usage vs plan limits dashboard                          |
| Chat          | [`shedflare/chat`](https://github.com/shedflare/chat)                   | AI chat interface with browser automation and Durable Objects sync |
| Discord       | [`shedflare/discord`](https://github.com/shedflare/discord)             | Personal Discord bot                                               |
| Drive         | [`shedflare/drive`](https://github.com/shedflare/drive)                 | Independently deployed file storage app                            |
| Homepage      | [`shedflare/homepage`](https://github.com/shedflare/homepage)           | Personal homepage with profile, experience, and projects           |
| Links         | [`shedflare/links`](https://github.com/shedflare/links)                 | Link shortener with dashboard                                      |
| Money         | [`shedflare/money`](https://github.com/shedflare/money)                 | Envelope-budgeting personal finance app                            |
| Observability | [`shedflare/observability`](https://github.com/shedflare/observability) | Centralized error collection from tail events                      |
| Routines      | [`shedflare/routines`](https://github.com/shedflare/routines)           | Daily routine tracker with progress visualization                  |

## Quick Start

```bash
pnpm install
cp shedflare.config.example.jsonc shedflare.config.jsonc
# Edit shedflare.config.jsonc with your domain, email, and selected apps

# Deploy the full production suite
pnpm deploy
```

Deploy auth first if you want to deploy apps individually:

```bash
pnpm deploy:auth
pnpm deploy:chat
pnpm deploy:anki
pnpm deploy:homepage
# ...etc
```

## Development

Make application changes in its standalone sibling repository. Use this checkout only for the
suite CLI, console, compatibility orchestration, and release-registry migration work.

## Deployment

All apps deploy with Alchemy. Each app has its own `alchemy.run.ts` that declares its Cloudflare resources (Workers, D1, R2, Durable Objects, etc). The public deploy and destroy scripts target the `prod` Alchemy stage.

```bash
# Full production suite
pnpm deploy

# Individual apps
pnpm deploy:auth
pnpm deploy:chat
pnpm deploy:money
pnpm deploy:anki
pnpm deploy:homepage
pnpm deploy:cf-bill
pnpm deploy:routines
pnpm deploy:observability
pnpm deploy:s

# Destroy production resources
pnpm destroy           # full suite
pnpm destroy:auth      # individual
```

Deploy `@shedflare/auth` first if deploying individually — other apps use it as `AUTH_ISSUER_URL`.
Drive production deployment is owned by the standalone
[`shedflare/drive`](https://github.com/shedflare/drive) repository and is not part of suite deploy or
destroy commands.

For temporary stages, call Alchemy directly and pass a stage explicitly:

```bash
vp exec alchemy deploy apps/chat/alchemy.run.ts --stage dev-bolt --yes
```

Non-production stages derive separate subdomains automatically. For example, configured
subdomain `chat` becomes `chat-dev-bolt.peculiarnewbie.com` for `--stage dev-bolt`;
`prod` keeps the configured subdomain unchanged.

## Configuration

`shedflare.config.jsonc` (gitignored) is the source of truth for desired deployment state. App presence means selected; manifest defaults supply subdomains and user-var defaults, so the config stores only deviations. Create it from the committed version-2 template:

```bash
cp shedflare.config.example.jsonc shedflare.config.jsonc
```

Operator secrets are managed via `Shedflare.WorkerSecret` in Alchemy stacks. See `docs/operator-secrets.md`.

The app catalog comes from `apps/*/shedflare.app.jsonc`. After adding or removing an app, regenerate and verify the typed registry:

```bash
pnpm registry:generate
pnpm contract:check
```

Existing version-1 configs remain readable. Preview or explicitly write a local, backed-up migration with:

```bash
shedflare config migrate
shedflare config migrate --write --yes
```

## Testing

```bash
pnpm check          # lint + format + typecheck across all packages
pnpm test           # run all package tests
pnpm test:auth      # live Alchemy smoke test (requires SHEDFLARE_LIVE_ALCHEMY_TESTS=1)
```

## CLI

The `shedflare` CLI exposes scriptable configuration, deployment, and secret operations. The local Console (`shedflare dashboard`) is the primary human-facing control plane.

| Command                    | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `shedflare init`           | Create a new Shedflare workspace and configure apps   |
| `shedflare doctor`         | Check workspace for issues and missing configuration  |
| `shedflare config migrate` | Preview or write an explicit config v1 → v2 migration |
