# Drive Deployment Guide

Alchemy is the supported deployment lifecycle for Shedflare. Deploy Auth first,
then deploy Drive as an Auth client.

## Configure

Keep `drive` selected in `shedflare.config.jsonc`. The app URL, Auth issuer URL,
client ID, and owner email are derived from the root config and the app manifest.

Alchemy provisions the Drive D1 database and private R2 bucket, and applies the
checked-in migrations from `apps/drive/src/migrations`. Do not create resources,
copy IDs, or edit a Wrangler config by hand.

Alchemy also generates and installs `SECURE_UPLOAD_TOKEN_SECRET`. Drive uses it
to sign the short-lived capabilities created by the secure upload command button;
operators do not need to create or rotate this secret manually.

## Deploy

```bash
pnpm deploy:drive
```

The command deploys the Drive Alchemy stack to the `prod` stage. To remove only
Drive's production resources, run:

```bash
pnpm destroy:drive
```
