import { createId, nowIso, summarizeThreadTitle, type SyncServerEnvelope } from "#/domain";
import { OPENCODE_GO_BASE_URL, getDefaultModelId, modelTransportFor, type AppEnv } from "#/runtime";
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractChatCompletionTitle(value: unknown) {
  const response = asRecord(value);
  const choices = response?.choices;
  const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
  const message = asRecord(firstChoice?.message);
  return typeof message?.content === "string" ? message.content : null;
}

function extractResponsesTitle(value: unknown) {
  const response = asRecord(value);
  if (typeof response?.output_text === "string") return response.output_text;

  const output = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    const record = asRecord(item);
    const content = Array.isArray(record?.content) ? record.content : [];
    for (const part of content) {
      const contentPart = asRecord(part);
      if (typeof contentPart?.text === "string") return contentPart.text;
    }
  }
  return null;
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
      const data = (await response.json()) as unknown;
      const generated = useResponses
        ? extractResponsesTitle(data)
        : extractChatCompletionTitle(data);
      if (typeof generated === "string") {
        title = sanitizeGeneratedTitle(generated) ?? title;
      } else {
        const record = asRecord(data);
        const choices = record?.choices;
        const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
        syncLog("title_generation_no_content", {
          threadId: input.threadId,
          modelId,
          transport: useResponses ? "responses" : "chat-completions",
          hasChoices: Array.isArray(choices),
          hasMessage: firstChoice?.message != null,
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
