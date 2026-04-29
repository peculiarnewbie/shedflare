# Shedflare

Shedflare is a self-hosted suite of personal productivity tools for Cloudflare, starting with standalone apps for chat, drive storage, and notes. Each app is designed to be deployed to your own Cloudflare account and customized from a single monorepo.

## Quick Start

```bash
npx shedflare init
```

This will guide you through selecting apps, configuring Cloudflare resources, and deploying to your account. You can also run non-interactively:

```bash
npx shedflare init --apps auth,chat,drive --owner-email you@example.com --domain example.com --yes
```

## Apps

- `@shedflare/auth` in `apps/auth` is the central OpenAuth issuer.
- `@shedflare/chat` in `apps/chat` is an AI workspace with Durable Objects sync and Browser Rendering.
- `@shedflare/drive` in `apps/drive` is a minimal private file store with R2 storage, D1 metadata, tags, and search.

## Development

```bash
pnpm install
pnpm dev:auth
pnpm dev:chat
pnpm dev:drive
```

## Deployment

Apps deploy with Wrangler after you provision their Cloudflare resources and configure each app.

```bash
pnpm deploy:auth
pnpm deploy:chat
pnpm deploy:drive
```

Deploy `@shedflare/auth` first so app clients can use it as `AUTH_ISSUER_URL`.

## CLI

The `shedflare` CLI (`packages/cli`) is the main tool for setting up and deploying Shedflare apps. It is also published to npm.

| Command                       | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| `shedflare init`              | Create a new Shedflare workspace and configure apps  |
| `shedflare configure`         | Generate `wrangler.jsonc` from config and manifests  |
| `shedflare configure --check` | Validate generated configs are up-to-date            |
| `shedflare doctor`            | Check workspace for issues and missing configuration |

An OpenTUI-powered interactive installer (`@shedflare/tui` in `packages/cli-tui`) is planned for when OpenTUI supports Node.js.
