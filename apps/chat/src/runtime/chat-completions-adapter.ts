/**
 * Custom TanStack AI adapter for OpenAI-compatible /chat/completions endpoints.
 *
 * This adapter implements the TextAdapter interface required by TanStack AI's
 * chat() function, speaking the chat/completions SSE protocol.
 */

import type { StreamChunk, TextOptions, ModelMessage, ContentPart, Tool } from "@tanstack/ai";
import type { TraceSpanKind } from "#/domain";

export type ChatCompletionsAdapterConfig = {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  firstByteTimeout?: number;
  idleTimeout?: number;
  overallTimeout?: number;
  timeout?: number;
  trace?: <A>(
    name: string,
    kind: TraceSpanKind,
    attrs: Record<string, unknown>,
    run: () => Promise<A>,
  ) => Promise<A>;
};

export type ChatCompletionsUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
};

// Extended StreamChunk with custom metadata for reasoning tokens.
// Reasoning content deltas ride on the AG-UI CUSTOM event with
// `name === REASONING_CONTENT_EVENT` — see emission/consumption sites.
export type ExtendedStreamChunk = StreamChunk & {
  _reasoningTokens?: number;
};

/**
 * Name used on AG-UI `CUSTOM` events that carry a chunk of the model's
 * reasoning/thinking output. Emitted by providers that expose
 * `reasoning_content` on streaming deltas (e.g., OpenAI o-series,
 * Kimi K2.5, Anthropic via reasoning_content bridge). The stream
 * consumer batches these and flushes them as `reasoning` message_parts
 * so the UI can render a live, T3-style Reasoning chip.
 */
export const REASONING_CONTENT_EVENT = "reasoning_content" as const;

const DISABLE_FURTHER_TOOL_CALLS_SYSTEM_PROMPT = [
  "A previous tool result indicated that the available tool budget for this turn is exhausted.",
  "Do not request or mention tools. Answer directly now using the conversation and prior tool results.",
].join(" ");

// Re-export types for consumers
export type { ModelMessage, ContentPart, StreamChunk };

const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 60_000;
const DEFAULT_IDLE_TIMEOUT_MS = 90_000;
const DEFAULT_OVERALL_REQUEST_TIMEOUT_MS = 300_000;

function createRequestLifecycle(input: {
  externalSignal?: AbortSignal;
  overallTimeoutMs?: number;
  firstByteTimeoutMs?: number;
  idleTimeoutMs?: number;
}) {
  const controller = new AbortController();
  const overallTimeoutMs = input.overallTimeoutMs ?? DEFAULT_OVERALL_REQUEST_TIMEOUT_MS;
  const firstByteTimeoutMs = input.firstByteTimeoutMs ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS;
  const idleTimeoutMs = input.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  let overallTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let firstByteTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let idleTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let abortListener: (() => void) | null = null;

  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  if (input.externalSignal) {
    if (input.externalSignal.aborted) {
      abort(input.externalSignal.reason);
    } else {
      abortListener = () => abort(input.externalSignal?.reason);
      input.externalSignal.addEventListener("abort", abortListener, { once: true });
    }
  }

  if (overallTimeoutMs > 0) {
    overallTimeoutHandle = setTimeout(() => {
      abort(
        new Error(`Upstream chat completion exceeded overall timeout after ${overallTimeoutMs}ms`),
      );
    }, overallTimeoutMs);
  }

  if (firstByteTimeoutMs > 0) {
    firstByteTimeoutHandle = setTimeout(() => {
      abort(
        new Error(
          `Upstream chat completion did not produce a first byte within ${firstByteTimeoutMs}ms`,
        ),
      );
    }, firstByteTimeoutMs);
  }

  const resetIdleTimer = () => {
    if (idleTimeoutHandle) {
      clearTimeout(idleTimeoutHandle);
      idleTimeoutHandle = null;
    }
    if (idleTimeoutMs <= 0 || controller.signal.aborted) return;
    idleTimeoutHandle = setTimeout(() => {
      abort(new Error(`Upstream chat completion stream was idle for ${idleTimeoutMs}ms`));
    }, idleTimeoutMs);
  };

  return {
    signal: controller.signal,
    markFirstByteReceived() {
      if (firstByteTimeoutHandle) {
        clearTimeout(firstByteTimeoutHandle);
        firstByteTimeoutHandle = null;
      }
      resetIdleTimer();
    },
    markStreamChunkReceived() {
      resetIdleTimer();
    },
    cleanup() {
      if (overallTimeoutHandle) {
        clearTimeout(overallTimeoutHandle);
      }
      if (firstByteTimeoutHandle) {
        clearTimeout(firstByteTimeoutHandle);
      }
      if (idleTimeoutHandle) {
        clearTimeout(idleTimeoutHandle);
      }
      if (input.externalSignal && abortListener) {
        input.externalSignal.removeEventListener("abort", abortListener);
      }
    },
  };
}

/**
 * Extracts reasoning tokens from a usage object by performing a deep search.
 * Handles multiple naming conventions (snake_case, camelCase) and nested structures.
 */
function extractReasoningTokens(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;

  const queue: Record<string, unknown>[] = [usage as Record<string, unknown>];
  const seen = new Set<Record<string, unknown>>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);

    const value = current.reasoning_tokens ?? current.reasoningTokens;
    if (value !== undefined) {
      const tokens =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim()
            ? Number(value)
            : NaN;
      if (Number.isFinite(tokens)) {
        return Math.max(0, Math.round(tokens));
      }
    }

    for (const key of [
      "completion_tokens_details",
      "completionTokensDetails",
      "output_tokens_details",
      "outputTokensDetails",
      "details",
      "usage",
    ]) {
      const nested = current[key];
      if (nested && typeof nested === "object") {
        queue.push(nested as Record<string, unknown>);
      }
    }
  }

  return null;
}

/**
 * Converts TanStack AI ModelMessage format to OpenAI chat/completions message format.
 * Optionally includes reasoning_content for models that require it (e.g., Kimi K2.5).
 */
function convertToOpenAIMessages(
  messages: ModelMessage[],
  systemPrompts: string[] = [],
  pendingReasoningContent?: string | null,
  assistantToolCallMessages: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  // Add system prompts first
  for (const systemPrompt of systemPrompts) {
    if (systemPrompt.trim()) {
      result.push({
        role: "system",
        content: systemPrompt,
      });
    }
  }

  // Find the index of the last assistant message with tool_calls
  // This is the one that needs reasoning_content attached for continuation
  let lastToolCallAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant" && msg.toolCalls?.length) {
      lastToolCallAssistantIndex = i;
      break;
    }
  }

  // Convert each message
  let toolCallAssistantIndex = 0;
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (message.role === "tool") {
      const content = convertMessageContent(message.content);
      result.push({
        role: "tool",
        content: typeof content === "string" ? content : JSON.stringify(content ?? ""),
        tool_call_id: message.toolCallId,
      });
      continue;
    }

    const content = convertMessageContent(message.content);
    if (content === null && !(message.role === "assistant" && message.toolCalls?.length)) continue;

    const convertedMessage: Record<string, unknown> = {
      role: message.role,
    };
    if (message.role === "assistant" && message.toolCalls?.length) {
      const preservedAssistantToolCallMessage = assistantToolCallMessages[toolCallAssistantIndex++];
      if (preservedAssistantToolCallMessage) {
        result.push(JSON.parse(JSON.stringify(preservedAssistantToolCallMessage)));
        continue;
      }

      convertedMessage.content = content;
      convertedMessage.tool_calls = message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: toolCall.type,
        function: {
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        },
      }));

      // Include reasoning_content for the last assistant message with tool_calls
      // This is required for models that return reasoning_content alongside tool calls (e.g., Kimi K2.5)
      if (pendingReasoningContent && i === lastToolCallAssistantIndex) {
        convertedMessage.reasoning_content = pendingReasoningContent;
      }
    } else if (content !== null) {
      convertedMessage.content = content;
    }

    result.push(convertedMessage);
  }

  return result;
}

function convertToOpenAITools(
  tools: Tool[] | undefined,
): Array<Record<string, unknown>> | undefined {
  if (!tools?.length) return undefined;

  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema ?? {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  }));
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    console.warn("[completions] parseJsonObject failed for", value.slice(0, 200));
    return null;
  }
}

function contentDisablesFurtherToolCalls(content: ModelMessage["content"]): boolean {
  if (typeof content === "string") {
    return parseJsonObject(content)?.disableFurtherToolCalls === true;
  }
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    const text = (() => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object" || !("content" in part)) return "";
      const value = (part as { content?: unknown }).content;
      return typeof value === "string" ? value : "";
    })();
    return text ? parseJsonObject(text)?.disableFurtherToolCalls === true : false;
  });
}

function shouldDisableFurtherToolCalls(messages: ModelMessage[] | undefined): boolean {
  if (!messages?.length) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== "tool") {
      // Only inspect the latest contiguous tool-result block.
      if (i !== messages.length - 1) break;
      continue;
    }
    if (contentDisablesFurtherToolCalls(message.content)) return true;
  }
  return false;
}

/**
 * Converts ModelMessage content to OpenAI format.
 */
function convertMessageContent(
  content: ModelMessage["content"],
): string | Array<Record<string, unknown>> | null {
  // Null content
  if (content === null) return null;

  // String content passes through
  if (typeof content === "string") {
    return content;
  }

  // Array content needs conversion
  if (Array.isArray(content)) {
    const parts: Array<Record<string, unknown>> = [];

    for (const part of content) {
      if (typeof part === "string") {
        parts.push({ type: "text", text: part });
        continue;
      }

      const typedPart = part as ContentPart;
      if (typedPart.type === "text") {
        // TextPart uses 'content' property
        parts.push({ type: "text", text: (typedPart as any).content });
        continue;
      }

      if (typedPart.type === "image") {
        // ImagePart has source with type 'url' or 'data'
        const source = (typedPart as any).source as {
          type: string;
          value: string;
          mimeType?: string;
        };
        if (source.type === "url") {
          parts.push({
            type: "image_url",
            image_url: { url: source.value },
          });
        } else if (source.type === "data") {
          parts.push({
            type: "image_url",
            image_url: {
              url: `data:${source.mimeType};base64,${source.value}`,
            },
          });
        }
        continue;
      }
    }

    // If only one text part, return as string for compatibility
    if (parts.length === 1 && parts[0].type === "text") {
      return parts[0].text as string;
    }

    return parts.length > 0 ? parts : null;
  }

  return null;
}

/**
 * Extracts text content from a chat completion response.
 */
function extractChatCompletionText(
  content: string | Array<{ type?: string; text?: string }> | undefined,
): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractReasoningChunk(choice: Record<string, any> | undefined): string {
  if (!choice || typeof choice !== "object") return "";

  const candidateContainers = [choice.delta, choice.message];
  for (const container of candidateContainers) {
    if (!container || typeof container !== "object") continue;
    for (const key of [
      "reasoning_content",
      "reasoningContent",
      "reasoning_delta",
      "reasoningDelta",
      "reasoning",
    ]) {
      const value = container[key];
      if (typeof value === "string" && value) {
        return value;
      }
    }
  }

  return "";
}

/**
 * Generate a unique ID for events
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Custom adapter for OpenAI-compatible /chat/completions endpoints.
 *
 * Implements the TextAdapter interface required by TanStack AI's chat() function.
 */
export class ChatCompletionsAdapter {
  readonly kind = "text" as const;
  readonly name = "chat-completions";
  readonly model: string;

  // Type marker for TanStack AI (never assigned at runtime)
  "~types"!: {
    providerOptions: Record<string, unknown>;
    inputModalities: readonly ["text", "image"];
    messageMetadataByModality: Record<string, unknown>;
  };

  private readonly config: ChatCompletionsAdapterConfig;

  /** Last reasoning_content we observed (or had to carry forward) for tool continuations. */
  private lastReasoningContent: string | null = null;
  /** Provider-shaped assistant tool-call messages preserved in turn order. */
  private assistantToolCallMessageHistory: Array<Record<string, unknown>> = [];

  /**
   * Stores modelOptions from the first request to ensure they're applied
   * to all subsequent requests in a tool call loop. TanStack AI may not
   * preserve these across iterations.
   */
  private persistedModelOptions: Record<string, unknown> | null = null;

  constructor(config: ChatCompletionsAdapterConfig, modelId: string) {
    this.config = config;
    this.model = modelId;
  }

  /**
   * Streaming chat completion that yields AG-UI events.
   */
  async *chatStream(options: TextOptions): AsyncIterable<ExtendedStreamChunk> {
    // Include any preserved reasoning/tool-call messages from previous tool iterations.
    const reasoningToInclude = this.lastReasoningContent;

    // Store modelOptions from the first request to ensure they're applied consistently
    // TanStack AI may not preserve these across tool call iterations
    if (options.modelOptions && !this.persistedModelOptions) {
      this.persistedModelOptions = options.modelOptions;
    }
    const effectiveModelOptions = options.modelOptions ?? this.persistedModelOptions;

    const disableFurtherToolCalls = shouldDisableFurtherToolCalls(options.messages);
    const systemPrompts = disableFurtherToolCalls
      ? [...(options.systemPrompts ?? []), DISABLE_FURTHER_TOOL_CALLS_SYSTEM_PROMPT]
      : options.systemPrompts;

    const messages = convertToOpenAIMessages(
      options.messages ?? [],
      systemPrompts,
      reasoningToInclude,
      this.assistantToolCallMessageHistory,
    );
    const tools = disableFurtherToolCalls ? undefined : convertToOpenAITools(options.tools);
    const trace =
      this.config.trace ??
      ((_: string, __: TraceSpanKind, ___: Record<string, unknown>, run: () => Promise<any>) =>
        run());

    const runId = generateId();
    const messageId = generateId();
    const request = createRequestLifecycle({
      externalSignal: options.abortController?.signal,
      overallTimeoutMs: this.config.overallTimeout ?? this.config.timeout,
      firstByteTimeoutMs: this.config.firstByteTimeout,
      idleTimeoutMs: this.config.idleTimeout,
    });

    // Emit RUN_STARTED
    yield {
      type: "RUN_STARTED",
      runId,
      timestamp: Date.now(),
      model: this.model,
    } as ExtendedStreamChunk;

    try {
      const url = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
      const response = await trace(
        "assistant.upstream.chat",
        "model",
        {
          modelId: this.model,
          stream: true,
          messageCount: messages.length,
          toolCount: tools?.length ?? 0,
          toolsDisabled: disableFurtherToolCalls,
          firstByteTimeoutMs: this.config.firstByteTimeout ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS,
          idleTimeoutMs: this.config.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS,
          overallTimeoutMs:
            this.config.overallTimeout ?? this.config.timeout ?? DEFAULT_OVERALL_REQUEST_TIMEOUT_MS,
        },
        () =>
          fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.config.apiKey}`,
              ...this.config.headers,
            },
            body: JSON.stringify({
              model: this.model,
              stream: true,
              stream_options: { include_usage: true },
              messages,
              ...(tools ? { tools } : {}),
              ...(options.temperature !== undefined && {
                temperature: options.temperature,
              }),
              ...(options.maxTokens !== undefined && {
                max_tokens: options.maxTokens,
              }),
              ...effectiveModelOptions,
            }),
            signal: request.signal,
          }),
      );

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => "Unknown error");
        yield {
          type: "RUN_ERROR",
          runId,
          error: {
            message: `HTTP ${response.status}: ${errorText.slice(0, 500)}`,
            code: String(response.status),
          },
        } as ExtendedStreamChunk;
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let messageStarted = false;
      let usage: ChatCompletionsUsage = {
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
      };
      let finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null = null;
      let sawDoneMarker = false;
      let sawUsageChunk = false;
      let reasoningContent = "";
      let assistantContent: string | null = null;
      const toolCalls = new Map<
        number,
        {
          toolCallId: string;
          toolName: string;
          args: string;
          started: boolean;
        }
      >();

      while (true) {
        const { done, value } = await reader.read();
        if (value && value.byteLength > 0) {
          request.markFirstByteReceived();
          request.markStreamChunkReceived();
        }
        if (value && value.byteLength > 0) {
          buffer += decoder.decode(value, { stream: true });
        }
        if (done) {
          // Some OpenAI-compatible proxies close immediately after the final
          // SSE event instead of sending the usual blank line or [DONE].
          buffer += decoder.decode();
          if (buffer.trim()) buffer += "\n\n";
        }

        // Process complete SSE blocks (delimited by a blank line). Accept both
        // LF and CRLF framing because providers are not consistent here.
        while (true) {
          const separator = buffer.match(/\r?\n\r?\n/);
          if (!separator || separator.index === undefined) break;
          const block = buffer.slice(0, separator.index);
          buffer = buffer.slice(separator.index + separator[0].length);

          // Extract data lines
          const dataLines = block
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());

          if (dataLines.length === 0) continue;

          const payloadJson = dataLines.join("\n");
          if (payloadJson === "[DONE]") {
            sawDoneMarker = true;
            continue;
          }

          let parsed: any;
          try {
            parsed = JSON.parse(payloadJson);
          } catch {
            console.warn(
              "[completions] SSE parse failed for payload",
              (payloadJson as string).slice(0, 200),
            );
            continue;
          }

          // Extract usage information
          if (parsed.usage) {
            sawUsageChunk = true;
            usage.promptTokens = parsed.usage.prompt_tokens ?? null;
            usage.completionTokens = parsed.usage.completion_tokens ?? null;
            const reasoningTokens = extractReasoningTokens(parsed.usage);
            if (reasoningTokens !== null) {
              usage.reasoningTokens = reasoningTokens;
            }
          }

          const choice = parsed.choices?.[0];
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }

          // Capture reasoning content for models that use interleaved thinking.
          // Some upstream proxies expose this as reasoningContent/reasoning/reasoning_delta.
          const reasoningDelta = extractReasoningChunk(choice);
          if (reasoningDelta) {
            reasoningContent += reasoningDelta;
            // Surface the reasoning chunk to the consumer via the AG-UI
            // `CUSTOM` event extension point so the UI can render a live
            // Reasoning chip alongside the main answer. The adapter also
            // continues accumulating `reasoningContent` locally for
            // tool-call continuations (Kimi K2.5, see below).
            yield {
              type: "CUSTOM",
              name: REASONING_CONTENT_EVENT,
              value: {
                messageId,
                delta: reasoningDelta,
              },
              timestamp: Date.now(),
              model: this.model,
              rawEvent: parsed,
            } as ExtendedStreamChunk;
          }

          const toolCallDeltas = Array.isArray(choice?.delta?.tool_calls)
            ? choice.delta.tool_calls
            : [];
          for (const toolCallDelta of toolCallDeltas) {
            const index = typeof toolCallDelta?.index === "number" ? toolCallDelta.index : 0;
            const current = toolCalls.get(index) ?? {
              toolCallId: toolCallDelta?.id || generateId(),
              toolName: toolCallDelta?.function?.name || `tool_${index}`,
              args: "",
              started: false,
            };

            if (typeof toolCallDelta?.id === "string" && toolCallDelta.id) {
              current.toolCallId = toolCallDelta.id;
            }
            if (typeof toolCallDelta?.function?.name === "string" && toolCallDelta.function.name) {
              current.toolName = toolCallDelta.function.name;
            }

            if (!current.started) {
              current.started = true;
              yield {
                type: "TOOL_CALL_START",
                toolCallId: current.toolCallId,
                toolName: current.toolName,
                parentMessageId: messageId,
                index,
                timestamp: Date.now(),
                model: this.model,
                rawEvent: parsed,
              } as ExtendedStreamChunk;
            }

            if (
              typeof toolCallDelta?.function?.arguments === "string" &&
              toolCallDelta.function.arguments
            ) {
              current.args += toolCallDelta.function.arguments;
              yield {
                type: "TOOL_CALL_ARGS",
                toolCallId: current.toolCallId,
                delta: toolCallDelta.function.arguments,
                args: current.args,
                timestamp: Date.now(),
                model: this.model,
                rawEvent: parsed,
              } as ExtendedStreamChunk;
            }

            toolCalls.set(index, current);
          }

          // Extract content delta
          const delta = choice?.delta?.content ?? "";
          if (!delta) continue;

          assistantContent = (assistantContent ?? "") + delta;

          // Emit TEXT_MESSAGE_START on first content
          if (!messageStarted) {
            messageStarted = true;
            yield {
              type: "TEXT_MESSAGE_START",
              messageId,
              role: "assistant",
              timestamp: Date.now(),
              model: this.model,
              rawEvent: parsed,
            } as ExtendedStreamChunk;
          }

          // Emit TEXT_MESSAGE_CONTENT for each delta
          yield {
            type: "TEXT_MESSAGE_CONTENT",
            messageId,
            delta,
            timestamp: Date.now(),
            model: this.model,
            rawEvent: parsed,
          } as ExtendedStreamChunk;
        }
        if (done) break;
      }

      // Emit TEXT_MESSAGE_END if message was started
      if (messageStarted) {
        yield {
          type: "TEXT_MESSAGE_END",
          messageId,
          timestamp: Date.now(),
          model: this.model,
        } as ExtendedStreamChunk;
      }

      for (const [, toolCall] of toolCalls) {
        let parsedInput: unknown;
        if (toolCall.args.trim()) {
          try {
            parsedInput = JSON.parse(toolCall.args);
          } catch {
            console.warn(
              "[completions] tool call args parse failed for",
              toolCall.toolName,
              (toolCall.args as string).slice(0, 200),
            );
            parsedInput = undefined;
          }
        }

        yield {
          type: "TOOL_CALL_END",
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          ...(parsedInput !== undefined ? { input: parsedInput } : {}),
          timestamp: Date.now(),
          model: this.model,
        } as ExtendedStreamChunk;
      }

      // Store reasoning_content for tool call continuations (needed for Kimi K2.5 and similar).
      // Some providers still emit reasoning_content on tool turns even when we requested
      // thinking-disabled mode, and they expect the continuation to replay the assistant
      // tool-call message losslessly. UI suppression happens elsewhere; here we preserve the
      // upstream message shape exactly so the continuation request remains valid.
      //
      // On multi-tool turns the provider may emit reasoning_content on the first tool-call
      // assistant message but omit it on later ones while still expecting the continuation
      // request to carry the prior replay field. When no fresh reasoning chunk was observed,
      // carry forward the last value we sent.
      if (toolCalls.size > 0) {
        const continuationReasoningContent = reasoningContent || this.lastReasoningContent || null;
        this.lastReasoningContent = continuationReasoningContent;
        const providerToolCallMessage = {
          role: "assistant",
          content: assistantContent,
          tool_calls: [...toolCalls.values()].map((toolCall) => ({
            id: toolCall.toolCallId,
            type: "function",
            function: {
              name: toolCall.toolName,
              arguments: toolCall.args,
            },
          })),
          ...(continuationReasoningContent
            ? { reasoning_content: continuationReasoningContent }
            : {}),
        };
        const historicalToolCallCount = (options.messages ?? []).filter(
          (message) => message.role === "assistant" && message.toolCalls?.length,
        ).length;
        this.assistantToolCallMessageHistory[historicalToolCallCount] = providerToolCallMessage;
      }

      if (finishReason === null) {
        if (sawDoneMarker || sawUsageChunk) {
          finishReason = "stop";
        } else {
          yield {
            type: "RUN_ERROR",
            runId,
            error: {
              message: "Upstream chat completion stream ended without a terminal marker",
              code: "assistant_stream_interrupted",
            },
            timestamp: Date.now(),
            model: this.model,
          } as ExtendedStreamChunk;
          return;
        }
      }

      // Emit RUN_FINISHED with usage (including custom _reasoningTokens field)
      const finishedEvent: ExtendedStreamChunk = {
        type: "RUN_FINISHED",
        runId,
        finishReason,
        usage:
          usage.promptTokens !== null || usage.completionTokens !== null
            ? {
                promptTokens: usage.promptTokens ?? 0,
                completionTokens: usage.completionTokens ?? 0,
                totalTokens: (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
              }
            : undefined,
        timestamp: Date.now(),
        model: this.model,
      } as ExtendedStreamChunk;

      // Add reasoning tokens as custom field
      if (usage.reasoningTokens !== null) {
        finishedEvent._reasoningTokens = usage.reasoningTokens;
      }

      yield finishedEvent;
    } catch (error) {
      yield {
        type: "RUN_ERROR",
        runId,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: "stream_error",
        },
        timestamp: Date.now(),
        model: this.model,
      } as ExtendedStreamChunk;
    } finally {
      request.cleanup();
    }
  }

  /**
   * Structured output using JSON schema response format.
   */
  async structuredOutput(options: {
    chatOptions: TextOptions;
    outputSchema: Record<string, unknown>;
  }): Promise<{ data: unknown; rawText: string }> {
    const messages = convertToOpenAIMessages(
      options.chatOptions.messages ?? [],
      options.chatOptions.systemPrompts,
    );
    const trace =
      this.config.trace ??
      ((_: string, __: TraceSpanKind, ___: Record<string, unknown>, run: () => Promise<any>) =>
        run());
    const request = createRequestLifecycle({
      externalSignal: options.chatOptions.abortController?.signal,
      overallTimeoutMs: this.config.overallTimeout ?? this.config.timeout,
      firstByteTimeoutMs: 0,
    });

    try {
      const url = `${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`;
      const response = await trace(
        "assistant.upstream.chat",
        "model",
        {
          modelId: this.model,
          stream: false,
          messageCount: messages.length,
        },
        () =>
          fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.config.apiKey}`,
              ...this.config.headers,
            },
            body: JSON.stringify({
              model: this.model,
              stream: false,
              messages,
              ...(options.chatOptions.temperature !== undefined && {
                temperature: options.chatOptions.temperature,
              }),
              ...(options.chatOptions.maxTokens !== undefined && {
                max_tokens: options.chatOptions.maxTokens,
              }),
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "structured_output",
                  schema: options.outputSchema,
                  strict: true,
                },
              },
              ...options.chatOptions.modelOptions,
            }),
            signal: request.signal,
          }),
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`);
      }

      const json = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | Array<{ type?: string; text?: string }>;
          };
        }>;
      };

      const rawText = extractChatCompletionText(json.choices?.[0]?.message?.content);
      const data = JSON.parse(rawText);

      return {
        data,
        rawText,
      };
    } finally {
      request.cleanup();
    }
  }
}

/**
 * Factory function to create a ChatCompletionsAdapter instance.
 * This follows the TanStack AI provider pattern.
 */
export function createChatCompletionsAdapter(
  config: ChatCompletionsAdapterConfig,
  modelId: string,
): ChatCompletionsAdapter {
  return new ChatCompletionsAdapter(config, modelId);
}

type ResponsesRecord = Record<string, unknown>;

function asResponsesRecord(value: unknown): ResponsesRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ResponsesRecord)
    : null;
}

function responseString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function responseNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function convertToResponsesContent(
  content: ModelMessage["content"],
  role: "user" | "assistant",
): string | Array<ResponsesRecord> | null {
  if (content === null) return null;
  if (typeof content === "string") return content;

  const parts: ResponsesRecord[] = [];
  const textType = role === "assistant" ? "output_text" : "input_text";
  for (const part of content) {
    if (typeof part === "string") {
      parts.push({ type: textType, text: part });
      continue;
    }

    if (part.type === "text") {
      parts.push({ type: textType, text: part.content });
      continue;
    }

    if (part.type === "image" && role === "user") {
      const imageUrl =
        part.source.type === "data"
          ? `data:${part.source.mimeType};base64,${part.source.value}`
          : part.source.value;
      parts.push({ type: "input_image", image_url: imageUrl });
    }
  }

  return parts.length > 0 ? parts : null;
}

function responseOutputForTool(content: ModelMessage["content"]) {
  const converted = convertToResponsesContent(content, "user");
  return typeof converted === "string" ? converted : JSON.stringify(converted ?? "");
}

function convertToResponsesInput(
  messages: ModelMessage[],
  systemPrompts: string[] = [],
): Array<ResponsesRecord> {
  const result: ResponsesRecord[] = [];

  for (const systemPrompt of systemPrompts) {
    if (systemPrompt.trim()) {
      result.push({
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      });
    }
  }

  for (const message of messages) {
    if (message.role === "tool") {
      result.push({
        type: "function_call_output",
        call_id: message.toolCallId,
        output: responseOutputForTool(message.content),
      });
      continue;
    }

    const content = convertToResponsesContent(message.content, message.role);
    if (content !== null) {
      result.push({
        role: message.role,
        content,
      });
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      for (const toolCall of message.toolCalls) {
        result.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        });
      }
    }
  }

  return result;
}

function convertToResponsesTools(tools: Tool[] | undefined): Array<ResponsesRecord> | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema ?? {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  }));
}

function extractResponsesText(value: unknown): string {
  const response = asResponsesRecord(value);
  if (!response) return "";

  const outputText = responseString(response.output_text);
  if (outputText) return outputText.trim();

  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => {
      const record = asResponsesRecord(item);
      const content = record && Array.isArray(record.content) ? record.content : [];
      return content.flatMap((part) => {
        const contentPart = asResponsesRecord(part);
        const text = contentPart && responseString(contentPart.text);
        return text ? [text] : [];
      });
    })
    .join("\n")
    .trim();
}

type ResponseToolCall = {
  itemId: string;
  callId: string;
  toolName: string;
  args: string;
  index: number;
  started: boolean;
};

/**
 * Adapter for OpenAI Responses-compatible model endpoints.
 *
 * OpenCode Go exposes GPT-5.6 Luna through `/responses`, while the rest of
 * the OpenCode Go models in this app use the chat-completions protocol.
 */
export class ResponsesAdapter {
  readonly kind = "text" as const;
  readonly name = "responses";
  readonly model: string;

  "~types"!: {
    providerOptions: Record<string, unknown>;
    inputModalities: readonly ["text", "image"];
    messageMetadataByModality: Record<string, unknown>;
  };

  private readonly config: ChatCompletionsAdapterConfig;

  constructor(config: ChatCompletionsAdapterConfig, modelId: string) {
    this.config = config;
    this.model = modelId;
  }

  async *chatStream(options: TextOptions): AsyncIterable<ExtendedStreamChunk> {
    const systemPrompts = shouldDisableFurtherToolCalls(options.messages)
      ? [...(options.systemPrompts ?? []), DISABLE_FURTHER_TOOL_CALLS_SYSTEM_PROMPT]
      : options.systemPrompts;
    const input = convertToResponsesInput(options.messages ?? [], systemPrompts);
    const tools = shouldDisableFurtherToolCalls(options.messages)
      ? undefined
      : convertToResponsesTools(options.tools);
    const trace =
      this.config.trace ??
      (<A>(_: string, __: TraceSpanKind, ___: Record<string, unknown>, run: () => Promise<A>) =>
        run());

    const runId = generateId();
    const messageId = generateId();
    const request = createRequestLifecycle({
      externalSignal: options.abortController?.signal,
      overallTimeoutMs: this.config.overallTimeout ?? this.config.timeout,
      firstByteTimeoutMs: this.config.firstByteTimeout,
      idleTimeoutMs: this.config.idleTimeout,
    });

    yield {
      type: "RUN_STARTED",
      runId,
      timestamp: Date.now(),
      model: this.model,
    } as ExtendedStreamChunk;

    try {
      const url = `${this.config.baseUrl.replace(/\/$/, "")}/responses`;
      const response = await trace(
        "assistant.upstream.responses",
        "model",
        {
          modelId: this.model,
          stream: true,
          inputItemCount: input.length,
          toolCount: tools?.length ?? 0,
          toolsDisabled: !tools,
          firstByteTimeoutMs: this.config.firstByteTimeout ?? DEFAULT_FIRST_BYTE_TIMEOUT_MS,
          idleTimeoutMs: this.config.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS,
          overallTimeoutMs:
            this.config.overallTimeout ?? this.config.timeout ?? DEFAULT_OVERALL_REQUEST_TIMEOUT_MS,
        },
        () =>
          fetch(url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${this.config.apiKey}`,
              ...this.config.headers,
            },
            body: JSON.stringify({
              model: this.model,
              stream: true,
              input,
              ...(tools ? { tools } : {}),
              ...(options.temperature !== undefined && { temperature: options.temperature }),
              ...(options.maxTokens !== undefined && { max_output_tokens: options.maxTokens }),
              ...options.modelOptions,
            }),
            signal: request.signal,
          }),
      );

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => "Unknown error");
        yield {
          type: "RUN_ERROR",
          runId,
          error: {
            message: `HTTP ${response.status}: ${errorText.slice(0, 500)}`,
            code: String(response.status),
          },
        } as ExtendedStreamChunk;
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let messageStarted = false;
      let sawTerminalEvent = false;
      let finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null = null;
      let assistantContent = "";
      let usage: ChatCompletionsUsage = {
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
      };
      const toolCalls = new Map<string, ResponseToolCall>();

      const emitToolStart = (toolCall: ResponseToolCall, rawEvent: unknown) => {
        if (toolCall.started) return null;
        toolCall.started = true;
        return {
          type: "TOOL_CALL_START" as const,
          toolCallId: toolCall.callId,
          toolName: toolCall.toolName,
          parentMessageId: messageId,
          index: toolCall.index,
          timestamp: Date.now(),
          model: this.model,
          rawEvent,
        } as ExtendedStreamChunk;
      };

      const ensureToolCall = (inputRecord: {
        itemId?: string | null;
        callId?: string | null;
        toolName?: string | null;
        index?: number | null;
      }) => {
        const itemId = inputRecord.itemId || inputRecord.callId || generateId();
        const existing = toolCalls.get(itemId);
        if (existing) {
          if (inputRecord.callId) existing.callId = inputRecord.callId;
          if (inputRecord.toolName) existing.toolName = inputRecord.toolName;
          if (inputRecord.index !== null && inputRecord.index !== undefined) {
            existing.index = inputRecord.index;
          }
          return existing;
        }
        const toolCall: ResponseToolCall = {
          itemId,
          callId: inputRecord.callId || itemId,
          toolName: inputRecord.toolName || "tool",
          args: "",
          index: inputRecord.index ?? toolCalls.size,
          started: false,
        };
        toolCalls.set(itemId, toolCall);
        return toolCall;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (value && value.byteLength > 0) {
          request.markFirstByteReceived();
          request.markStreamChunkReceived();
          buffer += decoder.decode(value, { stream: true });
        }
        if (done) {
          buffer += decoder.decode();
          if (buffer.trim()) buffer += "\n\n";
        }

        while (true) {
          const separator = buffer.match(/\r?\n\r?\n/);
          if (!separator || separator.index === undefined) break;
          const block = buffer.slice(0, separator.index);
          buffer = buffer.slice(separator.index + separator[0].length);
          const eventName = block
            .split(/\r?\n/)
            .find((line) => line.startsWith("event:"))
            ?.slice(6)
            .trim();
          const dataLines = block
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());
          if (dataLines.length === 0) continue;
          const payloadText = dataLines.join("\n");
          if (payloadText === "[DONE]") {
            sawTerminalEvent = true;
            continue;
          }

          let parsed: ResponsesRecord;
          try {
            const value = JSON.parse(payloadText) as unknown;
            const record = asResponsesRecord(value);
            if (!record) continue;
            parsed = record;
          } catch {
            console.warn("[responses] SSE parse failed for payload", payloadText.slice(0, 200));
            continue;
          }

          const type = responseString(parsed.type) ?? eventName ?? "";
          if (type === "response.output_text.delta") {
            const delta = responseString(parsed.delta) ?? "";
            if (!delta) continue;
            assistantContent += delta;
            if (!messageStarted) {
              messageStarted = true;
              yield {
                type: "TEXT_MESSAGE_START",
                messageId,
                role: "assistant",
                timestamp: Date.now(),
                model: this.model,
                rawEvent: parsed,
              } as ExtendedStreamChunk;
            }
            yield {
              type: "TEXT_MESSAGE_CONTENT",
              messageId,
              delta,
              timestamp: Date.now(),
              model: this.model,
              rawEvent: parsed,
            } as ExtendedStreamChunk;
            continue;
          }

          if (type === "response.output_item.added" || type === "response.output_item.done") {
            const item = asResponsesRecord(parsed.item);
            if (item && item.type === "function_call") {
              const toolCall = ensureToolCall({
                itemId: responseString(item.id),
                callId: responseString(item.call_id),
                toolName: responseString(item.name),
                index: responseNumber(parsed.output_index),
              });
              const start = emitToolStart(toolCall, parsed);
              if (start) yield start;
              const args = responseString(item.arguments);
              if (args && args !== toolCall.args) {
                const delta = args.startsWith(toolCall.args)
                  ? args.slice(toolCall.args.length)
                  : args;
                toolCall.args = args;
                if (delta) {
                  yield {
                    type: "TOOL_CALL_ARGS",
                    toolCallId: toolCall.callId,
                    delta,
                    args: toolCall.args,
                    timestamp: Date.now(),
                    model: this.model,
                    rawEvent: parsed,
                  } as ExtendedStreamChunk;
                }
              }
            }
            continue;
          }

          if (
            type === "response.function_call_arguments.delta" ||
            type === "response.function_call_arguments.done"
          ) {
            const toolCall = ensureToolCall({
              itemId: responseString(parsed.item_id),
              callId: responseString(parsed.call_id),
              toolName: responseString(parsed.name),
              index: responseNumber(parsed.output_index),
            });
            const start = emitToolStart(toolCall, parsed);
            if (start) yield start;
            const argumentDelta =
              type === "response.function_call_arguments.done"
                ? (responseString(parsed.arguments) ?? "")
                : (responseString(parsed.delta) ?? "");
            if (!argumentDelta) continue;
            const delta =
              type === "response.function_call_arguments.done" &&
              argumentDelta.startsWith(toolCall.args)
                ? argumentDelta.slice(toolCall.args.length)
                : argumentDelta;
            toolCall.args =
              type === "response.function_call_arguments.done"
                ? argumentDelta
                : toolCall.args + delta;
            if (delta) {
              yield {
                type: "TOOL_CALL_ARGS",
                toolCallId: toolCall.callId,
                delta,
                args: toolCall.args,
                timestamp: Date.now(),
                model: this.model,
                rawEvent: parsed,
              } as ExtendedStreamChunk;
            }
            continue;
          }

          if (type === "response.output_text.done") continue;

          if (type === "response.completed" || type === "response.incomplete") {
            sawTerminalEvent = true;
            const responseRecord = asResponsesRecord(parsed.response) ?? parsed;
            const responseUsage = asResponsesRecord(responseRecord.usage);
            if (responseUsage) {
              usage.promptTokens = responseNumber(responseUsage.input_tokens);
              usage.completionTokens = responseNumber(responseUsage.output_tokens);
              usage.reasoningTokens = extractReasoningTokens(responseUsage);
            }
            const status = responseString(responseRecord.status);
            finishReason =
              toolCalls.size > 0
                ? "tool_calls"
                : type === "response.incomplete" || status === "incomplete"
                  ? "length"
                  : "stop";
            continue;
          }

          if (type === "response.failed" || type === "error" || type === "response.error") {
            const responseRecord = asResponsesRecord(parsed.response);
            const errorRecord =
              asResponsesRecord(parsed.error) ?? asResponsesRecord(responseRecord?.error);
            const errorMessage =
              responseString(errorRecord?.message) ?? "Responses API request failed";
            yield {
              type: "RUN_ERROR",
              runId,
              error: {
                message: errorMessage,
                code: responseString(errorRecord?.code) ?? "responses_error",
              },
              timestamp: Date.now(),
              model: this.model,
            } as ExtendedStreamChunk;
            return;
          }
        }

        if (done) break;
      }

      if (messageStarted) {
        yield {
          type: "TEXT_MESSAGE_END",
          messageId,
          timestamp: Date.now(),
          model: this.model,
        } as ExtendedStreamChunk;
      }

      for (const toolCall of toolCalls.values()) {
        let inputValue: unknown;
        if (toolCall.args.trim()) {
          try {
            inputValue = JSON.parse(toolCall.args) as unknown;
          } catch {
            console.warn("[responses] tool call args parse failed for", toolCall.toolName);
          }
        }
        yield {
          type: "TOOL_CALL_END",
          toolCallId: toolCall.callId,
          toolName: toolCall.toolName,
          ...(inputValue !== undefined ? { input: inputValue } : {}),
          timestamp: Date.now(),
          model: this.model,
        } as ExtendedStreamChunk;
      }

      if (finishReason === null) {
        if (sawTerminalEvent) {
          finishReason = toolCalls.size > 0 ? "tool_calls" : "stop";
        } else {
          yield {
            type: "RUN_ERROR",
            runId,
            error: {
              message: "Upstream Responses stream ended without a terminal event",
              code: "assistant_stream_interrupted",
            },
            timestamp: Date.now(),
            model: this.model,
          } as ExtendedStreamChunk;
          return;
        }
      }

      yield {
        type: "RUN_FINISHED",
        runId,
        finishReason,
        usage:
          usage.promptTokens !== null || usage.completionTokens !== null
            ? {
                promptTokens: usage.promptTokens ?? 0,
                completionTokens: usage.completionTokens ?? 0,
                totalTokens: (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
              }
            : undefined,
        timestamp: Date.now(),
        model: this.model,
      } as ExtendedStreamChunk;
    } catch (error) {
      yield {
        type: "RUN_ERROR",
        runId,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: "stream_error",
        },
        timestamp: Date.now(),
        model: this.model,
      } as ExtendedStreamChunk;
    } finally {
      request.cleanup();
    }
  }

  async structuredOutput(options: {
    chatOptions: TextOptions;
    outputSchema: Record<string, unknown>;
  }): Promise<{ data: unknown; rawText: string }> {
    const input = convertToResponsesInput(
      options.chatOptions.messages ?? [],
      options.chatOptions.systemPrompts,
    );
    const request = createRequestLifecycle({
      externalSignal: options.chatOptions.abortController?.signal,
      overallTimeoutMs: this.config.overallTimeout ?? this.config.timeout,
      firstByteTimeoutMs: 0,
    });

    try {
      const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/responses`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
          ...this.config.headers,
        },
        body: JSON.stringify({
          model: this.model,
          input,
          stream: false,
          text: {
            format: {
              type: "json_schema",
              name: "structured_output",
              schema: options.outputSchema,
              strict: true,
            },
          },
          ...(options.chatOptions.maxTokens !== undefined && {
            max_output_tokens: options.chatOptions.maxTokens,
          }),
          ...options.chatOptions.modelOptions,
        }),
        signal: request.signal,
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 500)}`);
      }
      const json = (await response.json()) as unknown;
      const rawText = extractResponsesText(json);
      return { data: JSON.parse(rawText) as unknown, rawText };
    } finally {
      request.cleanup();
    }
  }
}

export function createResponsesAdapter(
  config: ChatCompletionsAdapterConfig,
  modelId: string,
): ResponsesAdapter {
  return new ResponsesAdapter(config, modelId);
}
