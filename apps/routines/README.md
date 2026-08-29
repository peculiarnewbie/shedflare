# Shedflare Routines

A private, self-hosted daily routine tracker with progress visualization.

## Development

Run Routines from the monorepo root:

```bash
pnpm install
pnpm --filter @shedflare/routines dev
pnpm --filter @shedflare/routines check
pnpm --filter @shedflare/routines test
pnpm --filter @shedflare/routines build
```

## Deployment

Routines can be deployed independently:

```bash
pnpm deploy:routines
```

Use `pnpm --filter @shedflare/routines plan --stage <name>` for an approved non-production
deployment proof. Do not deploy to production or point a temporary stage at production resources
without explicit approval.
