# Shedflare Anki

A calm, self-hosted spaced-repetition app deployed to your own Cloudflare account. Anki can be
configured and deployed independently even though its source lives in the Shedflare monorepo.

## Requirements

- Node.js 22.12 or newer
- pnpm 11.9
- A Cloudflare account
- An external Shedflare Auth issuer for the initial `0.1.x` release

## Setup

```sh
git clone git@github.com:shedflare/shedflare.git
cd shedflare
pnpm install
cp shedflare.config.example.jsonc shedflare.config.jsonc
cp apps/anki/.dev.vars.example apps/anki/.dev.vars
pnpm --filter @shedflare/anki check
pnpm --filter @shedflare/anki test
pnpm --filter @shedflare/anki build
```

Set the root `domain` and `ownerEmail`, and keep `auth` and `anki` selected in
`shedflare.config.jsonc`. App URLs and the shared Auth issuer are derived from that typed catalog.

## Deploy

Review a temporary-stage plan before deploying:

```sh
pnpm --filter @shedflare/anki plan --stage pilot
pnpm --filter @shedflare/anki deploy:stage --stage pilot
pnpm --filter @shedflare/anki destroy:stage --stage pilot
```

Non-production stages receive derived subdomains. For example, a configured `https://anki.example.com` becomes `https://anki-pilot.example.com` for stage `pilot`.

Production deployment is explicit:

```sh
pnpm deploy:anki
```

Alchemy owns the Worker and D1 lifecycle. Never point a test stage at production resource names.
