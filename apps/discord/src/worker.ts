/// <reference types="@cloudflare/workers-types" />

import type { DiscordEnv } from "#/env";
import { ensureGatewayConnected, routeRequest } from "#/router";

export { DiscordGatewayDurableObject } from "#/gateway/durable-object";
export { ChannelConversationDurableObject } from "#/conversation/durable-object";

export default {
  fetch(request: Request, env: DiscordEnv, ctx: ExecutionContext): Promise<Response> {
    return routeRequest(request, env, ctx);
  },

  async scheduled(_controller: ScheduledController, env: DiscordEnv, ctx: ExecutionContext) {
    ctx.waitUntil(ensureGatewayConnected(env));
  },
} satisfies ExportedHandler<DiscordEnv>;
