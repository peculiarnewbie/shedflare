# Money Deployment Guide

Deploy Shedflare Auth first, then deploy Money as an OpenAuth client.

## Architecture

Money runs as a Cloudflare Worker backed by D1 (SQLite) for storage, with R2 for file uploads. The schema is managed via Drizzle ORM.

The Worker is deployed by Alchemy, which provisions the D1 database and R2 bucket automatically.

## Quick Start

```bash
# Deploy the full suite (Money included)
pnpm deploy

# Or deploy Money standalone
pnpm deploy:money
```

## Configuration

### 1. `shedflare.config.jsonc` (required, gitignored)

Create from the example:

```bash
cp shedflare.config.example.jsonc shedflare.config.jsonc
```

Add the Money section:

```jsonc
{
  "appUrl": "https://shedflare.example.com",
  "ownerEmail": "you@example.com",
  "appSubdomains": { "money": "money" },
  "vars": {
    "money": {
      "AUTH_ISSUER_URL": "${appUrl}",
      "AUTH_CLIENT_ID": "shedflare-money",
      "OWNER_EMAIL": "${ownerEmail}",
    },
  },
}
```

### 2. `shedflare.config.example.jsonc`

The committed template shows the Money section structure. The actual config (`shedflare.config.jsonc`) is gitignored and contains real values.

### 3. `apps/money/shedflare.app.jsonc`

App manifest declaring resources. Already configured for Money:

```jsonc
{
  "id": "money",
  "name": "Shedflare Money",
  "description": "Envelope-budgeting personal finance app",
  "dependsOn": ["auth"],
  "defaultSubdomain": "money",
  "vars": {
    "APP_PUBLIC_URL": { "from": "appUrl" },
    "AUTH_ISSUER_URL": { "from": "appUrl", "app": "auth" },
    "AUTH_CLIENT_ID": { "from": "appId" },
    "OWNER_EMAIL": { "from": "ownerEmail" },
  },
  "resources": [
    { "type": "d1", "binding": "MONEY_DB" },
    { "type": "r2", "binding": "UPLOADS", "name": "shedflare-money-uploads" },
  ],
}
```

### 4. `apps/money/.dev.vars.example`

Local development environment template:

```env
AUTH_ISSUER_URL=http://localhost:8788
AUTH_CLIENT_ID=shedflare-money
OWNER_EMAIL=dev@example.com
```

Copy to `.dev.vars` for local development.

## Resources

The D1 database and R2 bucket are created automatically by the Alchemy stack:

- **D1:** `shedflare-money-db` (bound as `MONEY_DB`)
- **R2 bucket:** `shedflare-money-uploads` (for import file storage)

No manual provision required.

## Migrations

The schema is managed by Drizzle and applied via Alchemy's D1 migrations support (`apps/money/src/migrations`). No separate migration step is needed.

On Worker boot, the schema is initialized if needed.

## Local Development

```bash
# From repo root
pnpm dev:money
```

This starts the Worker in dev mode with local D1 storage. Set `DEV_AUTH_EMAIL` in `apps/money/.dev.vars` to bypass OAuth on localhost.

## Testing

```bash
# Run money app live smoke test (requires SHEDFLARE_LIVE_ALCHEMY_TESTS=1)
pnpm test:money

# Budget engine unit tests
pnpm test --filter @shedflare/money
```

## Deploy & Destroy

```bash
# Deploy money only
pnpm deploy:money

# Destroy money (removes DO, R2 bucket, and Worker)
pnpm destroy:money

# Deploy full suite
pnpm deploy

# Destroy full suite
pnpm destroy
```

## Verification

After deployment, verify:

1. Visit `https://money.shedflare.example.com` — should load the SolidJS SPA
2. Login via OpenAuth — should redirect to auth and back
3. Dashboard should load with seeded default widgets
4. Create a test account and transaction — should persist and display correctly
