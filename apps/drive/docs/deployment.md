# Drive Deployment Guide

Deploy Shedflare Auth first, then deploy Drive as an OpenAuth client.

## 1. Provision Storage

Create the D1 database and copy the returned database ID into `apps/drive/wrangler.jsonc`.

```bash
pnpm --filter @shedflare/drive exec wrangler d1 create shedflare-drive
```

Create the private R2 bucket:

```bash
pnpm --filter @shedflare/drive exec wrangler r2 bucket create shedflare-drive-files
```

## 2. Configure Drive

Update `apps/drive/wrangler.jsonc`:

```jsonc
"vars": {
  "APP_PUBLIC_URL": "https://sf-drive.example.com",
  "AUTH_ISSUER_URL": "https://sf-auth.example.com",
  "AUTH_CLIENT_ID": "shedflare-drive",
  "OWNER_EMAIL": "you@example.com"
}
```

`OWNER_EMAIL` must match the account allowed by Shedflare Auth.

## 3. Apply D1 Migrations

```bash
pnpm --filter @shedflare/drive db:migrate
```

For local development:

```bash
pnpm --filter @shedflare/drive db:migrate:local
```

## 4. Deploy

```bash
pnpm deploy:drive
```

## Local Development

Set `DEV_AUTH_EMAIL=you@example.com` in `apps/drive/.dev.vars` to bypass OAuth on localhost.
