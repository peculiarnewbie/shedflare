export type DiscordUser = {
  id: string;
  username: string;
  bot?: boolean;
};

export type DiscordMessageCreate = {
  id: string;
  channel_id: string;
  guild_id?: string;
  content: string;
  author: DiscordUser;
  mentions?: DiscordUser[];
  referenced_message?: DiscordMessageCreate | null;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_HISTORY = 20;

export function stripBotMention(content: string, botUserId: string): string {
  const mention = `<@${botUserId}>`;
  const nickMention = `<@!${botUserId}>`;
  return content.replaceAll(mention, "").replaceAll(nickMention, "").trim();
}

export function messageMentionsBot(message: DiscordMessageCreate, botUserId: string): boolean {
  return (message.mentions ?? []).some((user) => user.id === botUserId);
}

export function isAuthorizedDiscordUser(userId: string, ownerDiscordUserId: string): boolean {
  const allowed = ownerDiscordUserId.trim();
  if (!allowed) return true;
  return userId === allowed;
}

export function truncateForDiscord(text: string, max = 2000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export { MAX_HISTORY };
