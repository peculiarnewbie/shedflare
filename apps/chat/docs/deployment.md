# Chat Deployment Guide

Alchemy is the supported deployment lifecycle for Shedflare. Deploy Auth first,
then deploy Chat as an Auth client.

## Configure

Keep `chat` selected in `shedflare.config.jsonc`. Optional non-secret settings,
such as `DEFAULT_MODEL_ID`, belong under `apps.chat.vars`.

Chat requires `OPENCODE_GO_API_KEY`. In an interactive deployment the CLI prompts
for a missing required secret. In CI or a scripted deployment, provide it through
the environment:

```bash
OPENCODE_GO_API_KEY=... pnpm deploy:chat
```

After the Worker exists, a secret can also be rotated without a deployment:

```bash
shedflare secret set chat OPENCODE_GO_API_KEY
```

`UPLOAD_TOKEN_SECRET` is generated and managed by the Chat Alchemy stack.
`EXA_API_KEY` is optional. Chat's Browser Rendering capability must be enabled
for the Cloudflare account when the binding is used.

## Deploy

```bash
pnpm deploy:chat
```

The Alchemy stack provisions the uploads R2 bucket and sync Durable Object and
deploys the Worker to the `prod` stage. Do not
manually create those resources or deploy Chat with Wrangler.
