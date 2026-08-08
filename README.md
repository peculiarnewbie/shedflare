# Shedflare

Shedflare is a self-hosted suite of personal productivity tools for Cloudflare. Each app is a standalone Worker deployed to your own Cloudflare account via [Alchemy](https://alchemy.run), managed from a single monorepo.

> [!NOTE]
> Shedflare is moving toward independently installable app repositories, with the suite becoming an
> optional orchestration layer. See [ADR 0001](docs/architecture/0001-standalone-first-repositories.md)
> for the accepted direction and migration gates.

## Apps

| App           | Directory            | Description                                                        |
| ------------- | -------------------- | ------------------------------------------------------------------ |
| Anki          | `apps/anki`          | Personal spaced-repetition cards and review                        |
| Auth          | `apps/auth`          | OAuth2/OIDC authentication provider (OpenAuth)                     |
| Chat          | `apps/chat`          | AI chat interface with browser automation and Durable Objects sync |
| Homepage      | `apps/homepage`      | Personal homepage with profile, experience, and projects           |
| Drive         | `apps/drive`         | File storage with R2, D1 metadata, tags, and search                |
| Money         | `apps/money`         | Envelope-budgeting personal finance app                            |
| CF Bill       | `apps/cf-bill`       | Cloudflare usage vs plan limits dashboard                          |
| Routines      | `apps/routines`      | Daily routine tracker with progress visualization                  |
| Observability | `apps/observability` | Centralized error collection from tail events                      |
| Links         | `apps/s`             | Link shortener with dashboard                                      |

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
pnpm deploy:drive
pnpm deploy:anki
pnpm deploy:homepage
# ...etc
```

## Development

```bash
pnpm install
pnpm dev:auth
pnpm dev:chat
pnpm dev:drive
pnpm dev:money
```

## Deployment

All apps deploy with Alchemy. Each app has its own `alchemy.run.ts` that declares its Cloudflare resources (Workers, D1, R2, Durable Objects, etc). The public deploy and destroy scripts target the `prod` Alchemy stage.

```bash
# Full production suite
pnpm deploy

# Individual apps
pnpm deploy:auth
pnpm deploy:chat
pnpm deploy:drive
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
