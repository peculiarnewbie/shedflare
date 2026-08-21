# Shedflare Discord

Personal AI Discord bot on Cloudflare Workers. A Durable Object maintains the Discord Gateway WebSocket and forwards `MESSAGE_CREATE` events to the worker so **@mentions** work without discord.js or an external host.

## Discord Developer Portal setup

1. Create an application and bot at [Discord Developer Portal](https://discord.com/developers/applications).
2. Enable **Message Content Intent** (privileged) under Bot → Privileged Gateway Intents.
3. Invite the bot with `bot` + `Send Messages` + `Read Message History` scopes.
4. Copy the bot token into `DISCORD_BOT_TOKEN`.

## Deploy

From the repo root:

```bash
pnpm deploy:discord
```

Then connect the Gateway once (cron also retries every 5 minutes):

```bash
curl -X POST "https://discord.<your-domain>/admin/gateway/connect" \
  -H "Authorization: Bearer <GATEWAY_ADMIN_SECRET>"
```

Check status:

```bash
curl "https://discord.<your-domain>/admin/gateway/status" \
  -H "Authorization: Bearer <GATEWAY_ADMIN_SECRET>"
```

Retrieve `GATEWAY_ADMIN_SECRET` from the Cloudflare Worker secrets for the discord worker (set at deploy time).

## Usage

Mention the bot in any channel or DM:

```
@MyBot what is the weather in Prague?
```

Optional: set `OWNER_DISCORD_USER_ID` in `shedflare.config.jsonc` to restrict who can invoke the bot.

Conversation history and assistant turns (model + **Exa web search** tool loop) live in `ChannelConversationDurableObject` — not on the Gateway DO, so tool calls do not interfere with WebSocket heartbeats.

## Web search

Search uses the same Exa stack as chat:

- Set `EXA_API_KEY` for the paid API path (recommended)
- Without a key, falls back to Exa's free MCP endpoint
- `PREFER_FREE_SEARCH=true` forces MCP even with a key
- `SEARCH_ENABLED=false` disables the tool entirely

## Architecture

```
Discord Gateway ──WebSocket──► DiscordGatewayDurableObject
                                      │ HTTP POST /internal/gateway
                                      ▼
                               Worker (@mention → AI → reply)
```

Conversation history is stored per channel in `ChannelConversationDurableObject`. Assistant turns (including search tool loops) run inside that same DO.

## Local dev

```bash
pnpm --filter @shedflare/discord dev
```

Copy `.dev.vars.example` to `.dev.vars` and fill in secrets.
