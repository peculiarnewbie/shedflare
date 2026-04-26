# Deployment Guide

Deploy Shedflare Auth first, then deploy Chat as an OpenAuth client with Vite+ and Wrangler.

## 1. Install and Log In

```bash
pnpm install
pnpm --filter @shedflare/chat exec wrangler login
```

## 2. Provision Cloudflare Resources

The Worker config is `apps/chat/wrangler.jsonc`. One resource needs one-time setup; the rest are declared in config and provisioned on deploy.

Create the private R2 bucket for attachments:

```bash
pnpm --filter @shedflare/chat exec wrangler r2 bucket create shedflare-chat-uploads
```

No setup required for:

- `SYNC_ENGINE` Durable Object — auto-provisioned on first deploy via the `migrations` block.
- `BROWSER` Browser Rendering binding — enabled per-account in the Cloudflare dashboard.
- custom domains — add a route in `wrangler.jsonc` or configure one in the Cloudflare dashboard.

## 3. Configure Auth

Chat uses the central Shedflare Auth Worker as its OpenAuth issuer. Deploy `@shedflare/auth` first, then set these vars in `apps/chat/wrangler.jsonc`:

```jsonc
"AUTH_ISSUER_URL": "https://sf-auth.example.com",
"AUTH_CLIENT_ID": "shedflare-chat"
```

## 4. Configure Environment

Plain variables live in `wrangler.jsonc` under `vars`. Secrets are set with `wrangler secret put` (or bulk-uploaded — see below).

| Name                          | Kind   | Required | Description                                                                |
| ----------------------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `APP_PUBLIC_URL`              | var    | yes      | Canonical public URL, e.g. `https://sf-chat.example.com`.                  |
| `AUTH_ISSUER_URL`             | var    | yes      | Canonical public URL for `@shedflare/auth`.                                |
| `AUTH_CLIENT_ID`              | var    | yes      | OAuth client ID for Chat, usually `shedflare-chat`.                        |
| `OWNER_EMAIL`                 | var    | yes      | The single Google account allowed to sign in. Others get `/forbidden`.     |
| `DEFAULT_MODEL_ID`            | var    | yes      | Model ID from your OpenCode Go catalog, or `"auto"` to let the app choose. |
| `OPENCODE_GO_MODEL_ALLOWLIST` | var    | no       | Comma-separated model IDs to expose. Omit to show the full catalog.        |
| `OPENCODE_GO_BASE_URL`        | secret | yes      | OpenCode Go API base URL.                                                  |
| `OPENCODE_GO_API_KEY`         | secret | yes      | OpenCode Go API key.                                                       |
| `UPLOAD_TOKEN_SECRET`         | secret | yes      | Signs attachment URLs. Generate with `openssl rand -hex 32`.               |
| `EXA_API_KEY`                 | secret | no       | Enables the paid Exa API. Without it, search uses Exa's free MCP endpoint. |

**Bulk-upload secrets** by filling in `.dev.vars` (copy from `.dev.vars.example`) and running:

```bash
pnpm --filter @shedflare/chat exec wrangler secret bulk apps/chat/.dev.vars
```

## 5. Deploy

```bash
pnpm deploy:chat
```

This runs the chat build followed by `wrangler deploy`, stamping the build with the current git SHA.

## Local Development

Copy `.dev.vars.example` to `.dev.vars` and fill in the same secrets used in production.

Optionally set `DEV_AUTH_EMAIL` in `.dev.vars` to bypass Google sign-in on localhost when no auth cookie is present. This only affects local dev.
