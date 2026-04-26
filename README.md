# Shedflare

Shedflare is a self-hosted suite of personal productivity tools for Cloudflare, starting with standalone apps for chat, drive storage, and notes. Each app is designed to be deployed to your own Cloudflare account and customized from a single monorepo.

## Apps

- `@shedflare/chat` in `apps/chat` is the first migrated app.

## Development

```bash
pnpm install
pnpm dev:chat
```

## Deployment

Chat deploys with Wrangler from `apps/chat` after you provision its Cloudflare resources and fill in `apps/chat/wrangler.jsonc`.

```bash
pnpm deploy:chat
```
