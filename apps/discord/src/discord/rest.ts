import { DISCORD_API_BASE } from "#/gateway/protocol";
import { truncateForDiscord } from "#/discord/types";

export async function sendChannelMessage(
  botToken: string,
  channelId: string,
  content: string,
  options?: { replyToMessageId?: string },
): Promise<void> {
  const body: Record<string, unknown> = {
    content: truncateForDiscord(content),
    allowed_mentions: { parse: [] },
  };
  if (options?.replyToMessageId) {
    body.message_reference = {
      message_id: options.replyToMessageId,
      fail_if_not_exists: false,
    };
  }

  const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bot ${botToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Discord send failed (${response.status}): ${errorText.slice(0, 300)}`);
  }
}

export async function sendTyping(botToken: string, channelId: string): Promise<void> {
  await fetch(`${DISCORD_API_BASE}/channels/${channelId}/typing`, {
    method: "POST",
    headers: { authorization: `Bot ${botToken}` },
  });
}
