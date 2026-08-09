import { describe, expect, it } from "vite-plus/test";
import {
  messageMentionsBot,
  stripBotMention,
  truncateForDiscord,
  type DiscordMessageCreate,
} from "#/discord/types";

const BOT_ID = "123456789012345678";

function message(content: string, mentions: string[] = []): DiscordMessageCreate {
  return {
    id: "1",
    channel_id: "2",
    content,
    author: { id: "9", username: "human" },
    mentions: mentions.map((id) => ({ id, username: "bot" })),
  };
}

describe("stripBotMention", () => {
  it("removes standard and nickname mention forms", () => {
    expect(stripBotMention(`<@${BOT_ID}> hello`, BOT_ID)).toBe("hello");
    expect(stripBotMention(`<@!${BOT_ID}> hello`, BOT_ID)).toBe("hello");
  });
});

describe("messageMentionsBot", () => {
  it("detects when the bot is mentioned", () => {
    expect(messageMentionsBot(message("hi", [BOT_ID]), BOT_ID)).toBe(true);
    expect(messageMentionsBot(message("hi", []), BOT_ID)).toBe(false);
  });
});

describe("truncateForDiscord", () => {
  it("caps content at 2000 characters", () => {
    expect(truncateForDiscord("a".repeat(2005)).length).toBe(2000);
  });
});
