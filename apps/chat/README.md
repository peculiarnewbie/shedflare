# Shedflare Chat

A self-hosted Shedflare chat app built with SolidJS and Cloudflare Workers.

## Deployment

See [Deployment Guide](docs/deployment.md) for the full Cloudflare, R2 uploads, OpenCode Go, and Exa setup.

Deploy Chat from the repository root:

```bash
pnpm deploy:chat
```

## Development

- Check everything is ready:

```bash
pnpm --filter @shedflare/chat ready
```

- Run the tests:

```bash
pnpm --filter @shedflare/chat test
```

- Build Chat:

```bash
pnpm --filter @shedflare/chat build
```

- Run the development server:

```bash
pnpm --filter @shedflare/chat dev
```
