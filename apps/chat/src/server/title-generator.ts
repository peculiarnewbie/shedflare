import {
  createId,
  nowIso,
  summarizeThreadTitle,
  type ExternalValue,
  type SyncServerEnvelope,
} from "#/domain";
import { OPENCODE_GO_BASE_URL, getDefaultModelId, modelTransportFor, type AppEnv } from "#/runtime";
import { getTitleGenerationModelOptions } from "./model-config";
import { syncLog, sanitizeGeneratedTitle } from "./sync-utils";
import type { ChatRepository } from "./chat-repository";
import { normalizeThread } from "./persistence-codecs";
import type { EventStore } from "./event-store";
import * as Schema from "effect/Schema";

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

const ChatCompletionTitleResponse = Schema.Struct({
  choices: Schema.optional(
    Schema.Array(
      Schema.Struct({ message: Schema.optional(Schema.Struct({ content: Schema.String })) }),
    ),
  ),
});
const ResponsesTitleResponse = Schema.Struct({
  output_text: Schema.optional(Schema.String),
  output: Schema.optional(
    Schema.Array(
      Schema.Struct({
        content: Schema.optional(
          Schema.Array(Schema.Struct({ text: Schema.optional(Schema.String) })),
        ),
      }),
    ),
  ),
});

function extractChatCompletionTitle(value: ExternalValue): string | null {
  try {
    return (
      Schema.decodeUnknownSync(ChatCompletionTitleResponse)(value).choices?.[0]?.message?.content ??
      null
    );
  } catch {
    return null;
  }
}

function extractResponsesTitle(value: ExternalValue): string | null {
  try {
    const response = Schema.decodeUnknownSync(ResponsesTitleResponse)(value);
    if (response.output_text) return response.output_text;
    for (const item of response.output ?? []) {
      for (const part of item.content ?? []) {
        if (part.text) return part.text;
      }
    }
    return null;
  } catch {
    return null;
  }
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
  const useResponses = modelTransportFor(modelId) === "responses";
  const systemPrompt = [
    "Generate a concise chat thread title for the user's prompt.",
    "Rules: 3 to 7 words. No quotes. No trailing punctuation. Return only the title.",
  ].join("\n");
  const promptText = input.promptText.slice(0, 4000);

  try {
    const response = await fetch(
      `${OPENCODE_GO_BASE_URL.replace(/\/$/, "")}/${useResponses ? "responses" : "chat/completions"}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ctx.env.OPENCODE_GO_API_KEY}`,
        },
        body: JSON.stringify(
          useResponses
            ? {
                model: modelId,
                stream: false,
                max_output_tokens: 64,
                input: [
                  { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
                  { role: "user", content: [{ type: "input_text", text: promptText }] },
                ],
              }
            : {
                model: modelId,
                stream: false,
                max_tokens: 64,
                temperature: 0.2,
                ...modelOptions,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: promptText },
                ],
              },
        ),
      },
    );
    if (response.ok) {
      const data: ExternalValue = await response.json();
      const generated = useResponses
        ? extractResponsesTitle(data)
        : extractChatCompletionTitle(data);
      if (generated !== null) {
        title = sanitizeGeneratedTitle(generated) ?? title;
      } else {
        const diagnostic = Schema.decodeUnknownSync(
          Schema.Struct({
            choices: Schema.optional(
              Schema.Array(Schema.Struct({ message: Schema.optional(Schema.Any) })),
            ),
          }),
        )(data);
        syncLog("title_generation_no_content", {
          threadId: input.threadId,
          modelId,
          transport: useResponses ? "responses" : "chat-completions",
          hasChoices: (diagnostic.choices?.length ?? 0) > 0,
          hasMessage: diagnostic.choices?.[0]?.message != null,
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
