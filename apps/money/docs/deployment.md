# Money Deployment Guide

Deploy Shedflare Auth first, then deploy Money as an OpenAuth client.

## 1. Provision Database

Create the D1 database and copy the returned database ID:

```bash
pnpm --filter @shedflare/money exec wrangler d1 create shedflare-money
```

## 2. Configure Money

Update `apps/money/wrangler.jsonc`:

```jsonc
"vars": {
  "APP_PUBLIC_URL": "https://sf-money.example.com",
  "AUTH_ISSUER_URL": "https://sf-auth.example.com",
  "AUTH_CLIENT_ID": "shedflare-money",
  "OWNER_EMAIL": "you@example.com"
}
```

`OWNER_EMAIL` must match the account allowed by Shedflare Auth.

## 3. Apply D1 Migrations

```bash
pnpm --filter @shedflare/money db:migrate
```

For local development:

```bash
pnpm --filter @shedflare/money db:migrate:local
```

## 4. Deploy

```bash
pnpm deploy:money
```

## Local Development

Set `DEV_AUTH_EMAIL=you@example.com` in `apps/money/.dev.vars` to bypass OAuth on localhost.
