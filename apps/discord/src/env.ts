import type { DiscordGatewayDurableObject } from "#/gateway/durable-object";
import type { ChannelConversationDurableObject } from "#/conversation/durable-object";

/** Bindings available inside ChannelConversationDurableObject. */
export type ConversationEnv = {
  OPENCODE_GO_API_KEY: string;
  EXA_API_KEY?: string;
  DEFAULT_MODEL_ID?: string;
  SEARCH_ENABLED?: string;
  PREFER_FREE_SEARCH?: string;
};

export type DiscordEnv = ConversationEnv & {
  APP_PUBLIC_URL: string;
  OWNER_DISCORD_USER_ID?: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_PUBLIC_KEY?: string;
  GATEWAY_WEBHOOK_SECRET: string;
  GATEWAY_ADMIN_SECRET: string;
  DISCORD_GATEWAY: DurableObjectNamespace<DiscordGatewayDurableObject>;
  CHANNEL_CONVERSATION: DurableObjectNamespace<ChannelConversationDurableObject>;
};
