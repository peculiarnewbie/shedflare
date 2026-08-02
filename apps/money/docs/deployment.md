# Money Deployment Guide

Alchemy is the supported deployment lifecycle for Shedflare. Deploy Auth first,
then deploy Money as an Auth client, or deploy the full suite with `pnpm deploy`.

## Configure

Keep `money` selected in `shedflare.config.jsonc`. Money's public URL, Auth
issuer, client ID, and owner email are derived from the root config and manifest.
There are no operator secrets in the Money manifest.

Alchemy provisions the Money D1 database and uploads R2 bucket and applies the
checked-in Drizzle migrations. Do not manually create resources or edit a
Wrangler config.

## Deploy and destroy

```bash
# Deploy Money only
pnpm deploy:money

# Destroy Money's production resources only
pnpm destroy:money

# Or operate on the complete suite
pnpm deploy
pnpm destroy
```

For temporary stages, use a direct Alchemy command with an explicit `--stage`,
as shown in the root README.
