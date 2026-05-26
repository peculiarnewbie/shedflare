# Money Deployment Guide

Deploy Shedflare Auth first, then deploy Money as an OpenAuth client.

## Architecture

Money runs as a Cloudflare Worker backed by a Durable Object (DO) with SQLite storage. Data lives entirely in the DO — no D1 database involved.

The DO name is fixed: `shedflare-money-owner` (class `MoneyBudgetDO`). There is one DO instance per deployment.

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
      "OWNER_EMAIL": "${ownerEmail}"
    }
  }
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
    "OWNER_EMAIL": { "from": "ownerEmail" }
  },
  "resources": [
    { "type": "durable_object", "binding": "BUDGET_DO", "class": "MoneyBudgetDO" },
    { "type": "r2", "binding": "UPLOADS", "name": "shedflare-money-uploads" }
  ]
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

## DO Setup

The DO and R2 bucket are created automatically by the Alchemy stack:

- **DO:** `MoneyBudgetDO` at physical name `shedflare-money-owner`
- **R2 bucket:** `shedflare-money-uploads` (for import file storage)

No manual provision required.

## Migrations

The schema is initialized on DO cold start. No separate migration step is needed.

The schema includes 32 tables covering accounts, categories, transactions, budgets, schedules, rules, tags, reports, dashboard widgets, settings, notes, events, and commands.

On DO boot:
1. Checks if `events` table exists
2. Creates/ensures all tables
3. Applies any pending migrations (e.g., `deleted` column on rules)
4. Inserts default exchange rate (16000 USD→IDR)

## Local Development

```bash
# From repo root
pnpm dev:money
```

This starts the Worker in dev mode with local DO storage. Set `DEV_AUTH_EMAIL` in `apps/money/.dev.vars` to bypass OAuth on localhost.

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
4. WebSocket connection should be established (check browser console)
5. Create a test account and transaction — should sync in real-time
