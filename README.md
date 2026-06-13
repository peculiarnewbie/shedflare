# Shedflare

Shedflare is a self-hosted suite of personal productivity tools for Cloudflare. Each app is a standalone Worker deployed to your own Cloudflare account via [Alchemy](https://alchemy.run), managed from a single monorepo.

## Apps

| App | Directory | Description |
| --- | --------- | ----------- |
| Auth | `apps/auth` | OAuth2/OIDC authentication provider (OpenAuth) |
| Chat | `apps/chat` | AI chat interface with browser automation and Durable Objects sync |
| Drive | `apps/drive` | File storage with R2, D1 metadata, tags, and search |
| Money | `apps/money` | Envelope-budgeting personal finance app |
| CF Bill | `apps/cf-bill` | Cloudflare usage vs plan limits dashboard |
| Observability | `apps/observability` | Centralized error collection from tail events |
| Links | `apps/s` | Link shortener with dashboard |
| YouTube | `apps/youtube` | YouTube Watch Later manager and notification dashboard |

## Quick Start

```bash
pnpm install
cp shedflare.config.example.jsonc shedflare.config.jsonc
# Edit shedflare.config.jsonc with your domain, email, and app config

# Deploy the full suite
pnpm deploy
```

Deploy auth first if you want to deploy apps individually:

```bash
pnpm deploy:auth
pnpm deploy:chat
pnpm deploy:drive
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

All apps deploy with Alchemy. Each app has its own `alchemy.run.ts` that declares its Cloudflare resources (Workers, D1, R2, Durable Objects, etc).

```bash
# Full suite
pnpm deploy

# Individual apps
pnpm deploy:auth
pnpm deploy:chat
pnpm deploy:drive
pnpm deploy:money
pnpm deploy:youtube
pnpm deploy:cf-bill
pnpm deploy:observability
pnpm deploy:s

# Destroy
pnpm destroy           # full suite
pnpm destroy:auth      # individual
```

Deploy `@shedflare/auth` first if deploying individually — other apps use it as `AUTH_ISSUER_URL`.

## Configuration

`shedflare.config.jsonc` (gitignored) is the source of truth for deployment config — domain, email, app subdomains, and per-app vars. Create it from the committed template:

```bash
cp shedflare.config.example.jsonc shedflare.config.jsonc
```

Operator secrets are managed via `Shedflare.WorkerSecret` in Alchemy stacks. See `docs/operator-secrets.md`.

## Testing

```bash
pnpm check          # lint + format + typecheck across all packages
pnpm test           # run all package tests
pnpm test:auth      # live Alchemy smoke test (requires SHEDFLARE_LIVE_ALCHEMY_TESTS=1)
```

## CLI (deprecated)

The `shedflare` CLI (`packages/cli`) is deprecated. Use Alchemy deploy commands instead.

| Command | Description |
| ------- | ----------- |
| `shedflare init` | Create a new Shedflare workspace and configure apps |
| `shedflare doctor` | Check workspace for issues and missing configuration |
