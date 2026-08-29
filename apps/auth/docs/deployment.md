# Auth Deployment Guide

Alchemy is the supported deployment lifecycle for Shedflare. Deploy Auth first
when deploying apps individually; the other apps use it as their issuer.

## Configure

Create the desired-state config from the committed template if needed:

```bash
cp shedflare.config.example.jsonc shedflare.config.jsonc
```

Keep `auth` selected in `shedflare.config.jsonc` and set the Google OAuth client
ID at `apps.auth.vars.GOOGLE_CLIENT_ID`. The owner email comes from the root
`ownerEmail` value, and the public URL comes from the root domain plus the Auth
subdomain.

Temporary app deployments can opt into the shared issuer by setting
`apps.auth.vars.ADDITIONAL_ALLOWED_CLIENTS` to a JSON map. Each key must use
the `shedflare-<app>` client ID format and each value is an array of canonical
HTTPS origins:

```json
{
  "shedflare-drive": ["https://drive-preview.example.com"]
}
```

Configured suite app origins remain allowed; these entries add callback origins
for previews and independently deployed apps.

Configure the Google client with this redirect URI:

```text
https://auth.<your-domain>/google/callback
```

Alchemy provisions the OpenAuth KV namespace from `alchemy.run.ts`.
Do not create a separate KV namespace or edit a Wrangler config by hand.

## Deploy

```bash
pnpm deploy:auth
```

The command deploys only the Auth Alchemy stack to the `prod` stage. For a temporary
stage, use the direct Alchemy command documented in the root README.
