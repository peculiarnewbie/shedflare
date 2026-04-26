# Shedflare Chat

A standalone Shedflare chat app built with SolidJS and Cloudflare Workers.

## Deployment

See [Deployment Guide](docs/deployment.md) for the full Cloudflare, R2 uploads, OpenCode Go, and Exa setup.

Deploy from the repository root:

```bash
pnpm --filter @shedflare/chat deploy
```

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run test -r
```

- Build the monorepo:

```bash
vp run build -r
```

- Run the development server:

```bash
vp run dev
```
