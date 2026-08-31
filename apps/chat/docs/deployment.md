# Chat Deployment Guide

Alchemy is the supported deployment lifecycle for Shedflare. Deploy Auth first,
then deploy Chat as an Auth client.

## Configure

Keep `chat` selected in `shedflare.config.jsonc`. Optional non-secret settings,
such as `DEFAULT_MODEL_ID`, belong under `apps.chat.vars`.

Chat requires `OPENCODE_GO_API_KEY`. Set it once on the deployed Worker; later
deployments verify and preserve the existing binding without needing a local
copy:

```bash
shedflare secret set chat OPENCODE_GO_API_KEY
```

In CI, a value explicitly exported in the process environment is also treated
as a rotation for that deployment:

```bash
OPENCODE_GO_API_KEY=... pnpm deploy:chat
```

Local development is a separate destination. Store the value in the repository's
ignored `.env` explicitly, or update both destinations when that is genuinely
intended:

```bash
shedflare secret set chat OPENCODE_GO_API_KEY --local
shedflare secret set chat OPENCODE_GO_API_KEY --both
```

The default command never copies a production secret into `.env`.
Conversely, production deploy deliberately ignores `.env`, so a stale local
value cannot overwrite the binding stored on Cloudflare.

`UPLOAD_TOKEN_SECRET` is generated and managed by the Chat Alchemy stack.
`EXA_API_KEY` is optional. Chat's Browser Rendering capability must be enabled
for the Cloudflare account when the binding is used.

## Backups and restore

Chat writes versioned gzip snapshots to the configured R2 bucket. Version 2
contains the complete Shedflare sync state plus TanStack AI transcripts, runs,
interrupts, and compaction metadata. Version 1 snapshots remain restorable for
their original sync state.

The owner-authenticated HTTP routes are:

- `GET /api/backups/chat` — list retained snapshots.
- `POST /api/backups/chat` — create a snapshot immediately.
- `GET /api/backups/chat/download?key=...` — download one `.json.gz` snapshot.
- `POST /api/backups/chat/restore` — restore a snapshot with JSON body
  `{ "key": "...", "confirmation": "RESTORE_CHAT_BACKUP" }`.

Restore is rejected while an assistant turn is active. Before changing any
state, the route creates a fresh safety snapshot and returns its key. Product
tables and TanStack AI state are then restored in one Durable Object SQLite
transaction; formerly active runs and pending interrupts are restored as
aborted and cancelled so stale work cannot resume.

## Deploy

```bash
pnpm deploy:chat
```

The Alchemy stack provisions the uploads R2 bucket and sync Durable Object and
deploys the Worker to the `prod` stage. Do not
manually create those resources or deploy Chat with Wrangler.
