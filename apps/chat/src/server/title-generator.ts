import { createId, nowIso, summarizeThreadTitle, type SyncServerEnvelope } from "#/domain";
import { OPENCODE_GO_BASE_URL, getDefaultModelId, type AppEnv } from "#/runtime";
import { getTitleGenerationModelOptions } from "./model-config";
import { syncLog, sanitizeGeneratedTitle } from "./sync-utils";
import type { ChatRepository } from "./chat-repository";
import { normalizeThread } from "./persistence-codecs";
import type { EventStore } from "./event-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TitleGenerationInput {
  threadId: string;
  promptText: string;
  chatModelId: string;
  chatModelInterleavedField?: string | null;
}

export interface TitleGenerationContext {
  access: ChatRepository;
  eventStore: EventStore;
  env: AppEnv;
  broadcast: (envelope: SyncServerEnvelope) => void;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function generateThreadTitle(
  input: TitleGenerationInput,
  ctx: TitleGenerationContext,
) {
  const thread = ctx.access.getThread(input.threadId);
  if (!thread || thread.title !== "New Chat") return;
  const settings = ctx.access.getAccountSettings();
  const modelId =
    settings?.titleGenerationModelId?.trim() || input.chatModelId || getDefaultModelId(ctx.env);
  let title = summarizeThreadTitle(input.promptText);

  const modelInterleavedField = settings?.titleGenerationModelId?.trim()
    ? settings.titleGenerationModelInterleavedField
    : input.chatModelInterleavedField;
  const modelOptions = getTitleGenerationModelOptions(modelInterleavedField);

  try {
    const response = await fetch(`${OPENCODE_GO_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ctx.env.OPENCODE_GO_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelId,
        stream: false,
        max_tokens: 64,
        temperature: 0.2,
        ...modelOptions,
        messages: [
          {
            role: "system",
            content: [
              "Generate a concise chat thread title for the user's prompt.",
              "Rules: 3 to 7 words. No quotes. No trailing punctuation. Return only the title.",
            ].join("\n"),
          },
          { role: "user", content: input.promptText.slice(0, 4000) },
        ],
      }),
    });
    if (response.ok) {
      const data = (await response.json()) as any;
      const generated = data?.choices?.[0]?.message?.content;
      if (typeof generated === "string") {
        title = sanitizeGeneratedTitle(generated) ?? title;
      } else {
        syncLog("title_generation_no_content", {
          threadId: input.threadId,
          modelId,
          hasChoices: Array.isArray(data?.choices),
          hasMessage: data?.choices?.[0]?.message != null,
          hasReasoningContent: typeof data?.choices?.[0]?.message?.reasoning_content === "string",
        });
      }
    } else {
      const errorBody = await response.text().catch(() => "(read failed)");
      syncLog("title_generation_http_error", {
        threadId: input.threadId,
        modelId,
        status: response.status,
        bodyPreview: errorBody.slice(0, 400),
      });
    }
  } catch (error) {
    syncLog("title_generation_failed", {
      threadId: input.threadId,
      modelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const current = ctx.access.getThread(input.threadId);
  if (!current || current.title !== "New Chat") return;
  const updatedAt = nowIso();
  const event = await ctx.eventStore.appendServerEvent(null, "thread_upserted", {
    row: normalizeThread({ ...current, title, updatedAt }, createId("srvop")),
  });
  ctx.broadcast(event);
}
