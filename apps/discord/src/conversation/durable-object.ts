import { DurableObject } from "cloudflare:workers";
import { buildTurnMessages, runAssistantTurn } from "#/ai/turn";
import { MAX_HISTORY, type ConversationMessage } from "#/discord/types";
import type { ConversationEnv } from "#/env";

const HISTORY_KEY = "history";

export type MentionTurnInput = {
  prompt: string;
};

export type MentionTurnResult = {
  reply: string;
};

/**
 * Per-channel conversation + assistant turns (model + search tools).
 * One instance per Discord channel (idFromName(channelId)).
 *
 * Runs here — not on the Gateway DO — so multi-step tool loops do not
 * compete with Gateway heartbeats or reconnect logic.
 */
export class ChannelConversationDurableObject extends DurableObject<ConversationEnv> {
  async getHistory(limit = MAX_HISTORY): Promise<ConversationMessage[]> {
    const history = await this.ctx.storage.get<ConversationMessage[]>(HISTORY_KEY);
    if (!history?.length) return [];
    return history.slice(-limit);
  }

  async append(role: ConversationMessage["role"], content: string): Promise<ConversationMessage[]> {
    const trimmed = content.trim();
    if (!trimmed) return this.getHistory();

    const history = (await this.ctx.storage.get<ConversationMessage[]>(HISTORY_KEY)) ?? [];
    history.push({ role, content: trimmed });
    const next = history.slice(-MAX_HISTORY);
    await this.ctx.storage.put(HISTORY_KEY, next);
    return next;
  }

  async clear(): Promise<void> {
    await this.ctx.storage.delete(HISTORY_KEY);
  }

  async runMentionTurn(input: MentionTurnInput): Promise<MentionTurnResult> {
    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new Error("Prompt is empty");
    }

    const searchEnabled = this.env.SEARCH_ENABLED !== "false";
    const history = await this.getHistory();
    const messages = buildTurnMessages({
      history,
      prompt,
      searchEnabled,
    });

    const reply = await runAssistantTurn({
      apiKey: this.env.OPENCODE_GO_API_KEY,
      modelId: this.env.DEFAULT_MODEL_ID?.trim() || "auto",
      exaApiKey: this.env.EXA_API_KEY,
      preferFreeSearch: this.env.PREFER_FREE_SEARCH === "true",
      messages,
    });

    await this.append("user", prompt);
    await this.append("assistant", reply);
    return { reply };
  }
}

export function getConversationStub(
  namespace: DurableObjectNamespace<ChannelConversationDurableObject>,
  channelId: string,
) {
  return namespace.get(namespace.idFromName(channelId));
}
