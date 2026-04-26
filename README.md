# Shedflare

Shedflare is a self-hosted suite of personal productivity tools for Cloudflare, starting with standalone apps for chat, drive storage, and notes. Each app is designed to be deployed to your own Cloudflare account and customized from a single monorepo.

## Apps

- `@shedflare/auth` in `apps/auth` is the central OpenAuth issuer.
- `@shedflare/chat` in `apps/chat` is the first migrated app.
- `@shedflare/drive` in `apps/drive` is a minimal private file store with tags and search.

## Development

```bash
pnpm install
pnpm dev:auth
pnpm dev:chat
pnpm dev:drive
```

## Deployment

Apps deploy with Wrangler after you provision their Cloudflare resources and fill in each app's `wrangler.jsonc`.

```bash
pnpm deploy:auth
pnpm deploy:chat
pnpm deploy:drive
```

Deploy `@shedflare/auth` first so app clients can use it as `AUTH_ISSUER_URL`.
