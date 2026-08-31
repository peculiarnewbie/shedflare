# Shedflare Chat

A self-hosted Shedflare chat app built with SolidJS and Cloudflare Workers.

## AI runtime

Chat uses TanStack AI's official OpenAI-compatible adapter for OpenCode Go's Chat Completions and
Responses transports. TanStack owns the agent loop, AG-UI reasoning/tool events, tool schema
validation, cancellation, and provider message continuity.

The Durable Object keeps two deliberate views of a conversation: the existing Shedflare sync
projection for the offline/multi-device UI, and TanStack AI's canonical provider transcript for
tool calls, tool results, reasoning signatures, run lifecycle, and future resume semantics. Long
contexts use TanStack compaction with durable checkpoints; the canonical transcript is not
discarded.

Web search and page extraction are ordinary server tools with Standard Schema inputs and outputs.
Turning Search on requires one live grounding call, then the model returns to automatic tool choice.
Per-tool response budgets and TanStack's tool cache prevent runaway and duplicate calls, without
prompt sentinels or a custom agent loop.

R2 backups include both views. Authenticated backup routes can list, create, download, and restore
snapshots; restore automatically writes a new safety snapshot first.

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
