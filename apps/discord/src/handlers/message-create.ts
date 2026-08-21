import type { DiscordEnv } from "#/env";
import { getConversationStub } from "#/conversation/durable-object";
import { sendChannelMessage, sendTyping } from "#/discord/rest";
import {
  isAuthorizedDiscordUser,
  messageMentionsBot,
  stripBotMention,
  type DiscordMessageCreate,
} from "#/discord/types";
import type { GatewayWebhookEvent } from "#/gateway/protocol";
import { array, boolean, object, optional, parse, string } from "valibot";

const DiscordUserSchema = object({ id: string(), username: string(), bot: optional(boolean()) });
const DiscordMessageCreateSchema = object({
  id: string(),
  channel_id: string(),
  guild_id: optional(string()),
  content: string(),
  author: DiscordUserSchema,
  mentions: optional(array(DiscordUserSchema)),
});

export async function handleGatewayWebhookEvent(
  event: GatewayWebhookEvent,
  env: DiscordEnv,
): Promise<void> {
  if (event.type !== "MESSAGE_CREATE") return;
  await handleMessageCreate(parse(DiscordMessageCreateSchema, event.data), env, event.botUserId);
}

async function handleMessageCreate(
  message: DiscordMessageCreate,
  env: DiscordEnv,
  botUserId: string | null,
): Promise<void> {
  if (message.author.bot) return;
  if (!botUserId) {
    console.warn("[discord] MESSAGE_CREATE before READY; ignoring");
    return;
  }
  if (!messageMentionsBot(message, botUserId)) return;
  if (!isAuthorizedDiscordUser(message.author.id, env.OWNER_DISCORD_USER_ID ?? "")) return;

  const prompt = stripBotMention(message.content, botUserId);
  if (!prompt) return;

  const conversation = getConversationStub(env.CHANNEL_CONVERSATION, message.channel_id);

  try {
    await sendTyping(env.DISCORD_BOT_TOKEN, message.channel_id);
    const { reply } = await conversation.runMentionTurn({ prompt });
    await sendChannelMessage(env.DISCORD_BOT_TOKEN, message.channel_id, reply, {
      replyToMessageId: message.id,
    });
  } catch (error) {
    console.error("[discord] mention handler failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    await sendChannelMessage(
      env.DISCORD_BOT_TOKEN,
      message.channel_id,
      `Sorry, I hit an error: ${detail.slice(0, 500)}`,
      { replyToMessageId: message.id },
    );
  }
}
