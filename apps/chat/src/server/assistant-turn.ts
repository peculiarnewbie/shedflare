import {
  createId,
  createMessagePart,
  createTraceRun,
  createTraceSpan,
  clampSearchesPerTurn,
  MAX_TOOL_ITERATIONS_PER_TURN,
  nowIso,
  type CreateUserMessagePayload,
  type Message,
  type SyncEventType,
  type SyncServerEnvelope,
  type Thread,
  type TraceRun,
  type TraceSpan,
} from "#/domain";
import {
  OPENCODE_GO_BASE_URL,
  chat,
  createChatCompletionsAdapter,
  getDefaultModelId,
  type AppEnv,
} from "#/runtime";
import { combineStrategies, maxIterations, untilFinishReason } from "@tanstack/ai";
import {
  createStructuredLogger,
  makeRootTraceContext,
  makeTraceRecorder,
  runAppEffect,
  traceEffect,
} from "#/effect";
import { Effect } from "effect";
import { createExaSearchTool, type ToolProgressEvent } from "./search";
import { createBrowserExtractTool } from "./extract";
import { normalizeAssistantError } from "./error-normalization";
import { consumeAssistantStream, type StreamConsumerDeps } from "./stream-consumer";
import {
  getProviderModelOptions,
  getSearchToolSystemPrompt,
  EXTRACT_TOOL_SYSTEM_PROMPT,
} from "./model-config";
import {
  syncLog,
  json,
  parseJson,
  previewText,
  looksLikeMissingRealtimeAccess,
} from "./sync-utils";
import type { DataAccess } from "./data-access";
import { buildModelMessages } from "./data-access";
import type { EventStore } from "./event-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AssistantTurnPayload = Pick<
  CreateUserMessagePayload,
  | "threadId"
  | "modelId"
  | "modelInterleavedField"
  | "reasoningLevel"
  | "search"
  | "searchLimit"
  | "preferFreeSearch"
> & {
  thread: Thread;
  userMessage: Message;
  assistantMessage: Message;
};

export interface AssistantTurnContext {
  access: DataAccess;
  eventStore: EventStore;
  env: AppEnv;
  broadcast: (envelope: SyncServerEnvelope) => void;
  assistantTurnControllers: Map<string, AbortController>;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function runAssistantTurn(payload: AssistantTurnPayload, ctx: AssistantTurnContext) {
  const abortController = new AbortController();
  ctx.assistantTurnControllers.set(payload.assistantMessage.id, abortController);
  try {
    const traceContext = makeRootTraceContext({
      messageId: payload.assistantMessage.id,
      threadId: payload.threadId,
      modelId: payload.modelId,
      opId: payload.assistantMessage.opId ?? null,
    });
    const rootSpanId = createId("span");
    const childTraceContext = {
      ...traceContext,
      parentSpanId: rootSpanId,
    };
    const traceRuns = new Map<string, TraceRun>();
    const traceSpans = new Map<string, TraceSpan>();
    const turnLogger = createStructuredLogger("assistant-turn", {
      traceId: traceContext.traceId,
      traceRunId: traceContext.traceRunId,
      rootSpanId,
      messageId: payload.assistantMessage.id,
      threadId: payload.threadId,
      modelId: payload.modelId,
    });

    const upsertTraceRun = async (row: TraceRun) => {
      traceRuns.set(row.id, row);
      const event = await ctx.eventStore.appendServerEvent(null, "trace_run_upserted", { row });
      ctx.broadcast(event);
    };

    const upsertTraceSpan = async (row: TraceSpan) => {
      traceSpans.set(row.id, row);
      const event = await ctx.eventStore.appendServerEvent(null, "trace_span_upserted", { row });
      ctx.broadcast(event);
    };

    const recorder = makeTraceRecorder({
      scope: "assistant-turn",
      logger: turnLogger,
      onTraceRunStart: async (row) => {
        await upsertTraceRun(
          createTraceRun({
            id: row.id,
            messageId: row.messageId,
            threadId: row.threadId,
            workspaceId: row.workspaceId,
            traceId: row.traceId,
            rootSpanId: row.rootSpanId,
            modelId: row.modelId,
            status: row.status,
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            durationMs: row.durationMs,
            errorCode: row.errorCode,
            errorMessage: row.errorMessage,
            attrs: typeof row.attrsJson === "string" ? parseJson(row.attrsJson) : {},
          }),
        );
      },
      onTraceRunFinish: async (row) => {
        const current = traceRuns.get(row.id);
        if (!current) return;
        const { decodeTraceRunRow } = await import("#/domain");
        await upsertTraceRun(
          decodeTraceRunRow({
            ...current,
            ...row,
          }),
        );
      },
      onSpanStart: async (row) => {
        await upsertTraceSpan(
          createTraceSpan({
            id: row.id,
            traceRunId: row.traceRunId,
            traceId: row.traceId,
            parentSpanId: row.parentSpanId,
            messageId: row.messageId,
            name: row.name,
            kind: row.kind,
            status: row.status,
            startedAt: row.startedAt,
            endedAt: row.endedAt,
            durationMs: row.durationMs,
            errorCode: row.errorCode,
            errorMessage: row.errorMessage,
            attrs: typeof row.attrsJson === "string" ? parseJson(row.attrsJson) : {},
            events: typeof row.eventsJson === "string" ? parseJson(row.eventsJson) : [],
          }),
        );
      },
      onSpanFinish: async (row) => {
        const current = traceSpans.get(row.id);
        if (!current) return;
        const { decodeTraceSpanRow } = await import("#/domain");
        await upsertTraceSpan(
          decodeTraceSpanRow({
            ...current,
            ...row,
          }),
        );
      },
    });

    const traceRuntime = {
      env: ctx.env,
      traceRecorder: recorder,
      traceContext: childTraceContext,
    } satisfies Parameters<typeof runAppEffect>[1];

    const traceAsync = <A>(
      name: string,
      kind: TraceSpan["kind"],
      attrs: Record<string, unknown>,
      run: () => Promise<A>,
    ) => runAppEffect(traceEffect(name, kind, attrs, Effect.tryPromise(run)), traceRuntime);

    const traceSync = <A>(
      name: string,
      kind: TraceSpan["kind"],
      attrs: Record<string, unknown>,
      run: () => A,
    ) => runAppEffect(traceEffect(name, kind, attrs, Effect.sync(run)), traceRuntime);

    syncLog("assistant_turn_start", {
      threadId: payload.threadId,
      assistantMessageId: payload.assistantMessage.id,
      modelId: payload.modelId,
      reasoningLevel: payload.reasoningLevel,
      search: payload.search,
      searchLimit: payload.searchLimit ?? null,
      traceId: traceContext.traceId,
      traceRunId: traceContext.traceRunId,
    });

    await recorder.startTraceRun({
      traceRunId: traceContext.traceRunId,
      traceId: traceContext.traceId,
      rootSpanId,
      messageId: payload.assistantMessage.id,
      threadId: payload.threadId,
      workspaceId: payload.thread.workspaceId,
      modelId: payload.modelId || payload.assistantMessage.modelId || null,
      attrs: {
        reasoningLevel: payload.reasoningLevel,
        searchEnabled: payload.search,
        searchLimit: payload.searchLimit ?? null,
      },
    });
    await recorder.startSpan({
      spanId: rootSpanId,
      traceRunId: traceContext.traceRunId,
      traceId: traceContext.traceId,
      parentSpanId: null,
      messageId: payload.assistantMessage.id,
      name: "assistant.turn",
      kind: "root",
      attrs: {
        workspaceId: payload.thread.workspaceId,
        threadId: payload.threadId,
        messageId: payload.assistantMessage.id,
        modelId: payload.modelId || payload.assistantMessage.modelId || null,
        reasoningLevel: payload.reasoningLevel,
        searchEnabled: payload.search,
        searchLimit: payload.searchLimit ?? null,
      },
    });

    const thread = ctx.access.getThread(payload.threadId);
    if (!thread) {
      await recorder.finishSpan({
        spanId: rootSpanId,
        status: "failed",
        errorCode: "ThreadNotFound",
        errorMessage: "Thread not found",
      });
      await recorder.finishTraceRun({
        traceRunId: traceContext.traceRunId,
        status: "failed",
        errorCode: "ThreadNotFound",
        errorMessage: "Thread not found",
      });
      return;
    }
    const workspace = ctx.access.getWorkspace(thread.workspaceId);
    if (!workspace) {
      await recorder.finishSpan({
        spanId: rootSpanId,
        status: "failed",
        errorCode: "WorkspaceNotFound",
        errorMessage: "Workspace not found",
      });
      await recorder.finishTraceRun({
        traceRunId: traceContext.traceRunId,
        status: "failed",
        errorCode: "WorkspaceNotFound",
        errorMessage: "Workspace not found",
      });
      return;
    }
    const modelId = payload.modelId || workspace.defaultModelId || getDefaultModelId(ctx.env);
    childTraceContext.workspaceId = workspace.id;
    childTraceContext.modelId = modelId;
    let seq = 0;

    let commitPendingText: () => Promise<void> = async () => {};

    const rawAppendMessagePart = async (
      kind: "activity" | "thinking_tokens" | "text" | "reasoning",
      input: {
        text?: string;
        json?: string | null;
      },
    ) => {
      const part = createMessagePart({
        messageId: payload.assistantMessage.id,
        seq: seq++,
        kind,
        text: input.text ?? "",
        json: input.json ?? null,
      });
      const event = await ctx.eventStore.appendServerEvent(null, "message_part_appended", {
        row: part,
      });
      ctx.broadcast(event);
      return part;
    };

    const appendMessagePart = async (
      kind: "activity" | "thinking_tokens" | "text" | "reasoning",
      input: {
        text?: string;
        json?: string | null;
      },
    ) => {
      if (kind !== "text") {
        await commitPendingText();
      }
      return rawAppendMessagePart(kind, input);
    };

    const reportActivity = async (activity: ToolProgressEvent) => {
      await appendMessagePart("activity", {
        text: activity.label,
        json: json(activity),
      });
    };

    try {
      const threadMessages = await traceSync("assistant.thread_messages.load", "sync", {}, () =>
        ctx.access.getThreadMessages(thread, [payload.userMessage, payload.assistantMessage]),
      );
      const searchLimit = clampSearchesPerTurn(payload.searchLimit);
      const searchTool = payload.search
        ? createExaSearchTool({
            env: ctx.env,
            assistantMessageId: payload.assistantMessage.id,
            maxSearchesPerTurn: searchLimit,
            preferFreeExa: payload.preferFreeSearch ?? false,
            signal: abortController.signal,
            log: syncLog,
            trace: (name, attrs, run) =>
              traceAsync(
                name,
                name === "assistant.search.prepare" ? "internal" : "tool",
                attrs,
                run,
              ),
            onProgress: reportActivity,
            onSearchStateChange: async (state) => {
              const searchRunEvent = await ctx.eventStore.appendServerEvent(
                null,
                "search_runs_replaced",
                {
                  messageId: payload.assistantMessage.id,
                  rows: state.searchRuns,
                },
              );
              ctx.broadcast(searchRunEvent);

              const searchEvent = await ctx.eventStore.appendServerEvent(
                null,
                "search_results_replaced",
                {
                  messageId: payload.assistantMessage.id,
                  rows: state.searchResults,
                },
              );
              ctx.broadcast(searchEvent);
            },
          })
        : null;

      const extractToolConfigured = Boolean(ctx.env.BROWSER);
      const extractTool =
        payload.search && extractToolConfigured
          ? createBrowserExtractTool({
              env: ctx.env,
              assistantMessageId: payload.assistantMessage.id,
              signal: abortController.signal,
              log: syncLog,
              trace: (name, attrs, run) =>
                traceAsync(
                  name,
                  name === "assistant.extract.prepare" ? "internal" : "tool",
                  attrs,
                  run,
                ),
              onProgress: reportActivity,
              onExtractStateChange: async (state) => {
                const extractEvent = await ctx.eventStore.appendServerEvent(
                  null,
                  "extract_runs_replaced",
                  {
                    messageId: payload.assistantMessage.id,
                    rows: state.extractRuns,
                  },
                );
                ctx.broadcast(extractEvent);
              },
            })
          : null;

      const activeTools = [
        ...(searchTool ? [searchTool.tool] : []),
        ...(extractTool ? [extractTool.tool] : []),
      ];
      const toolCount = activeTools.length;

      const { messages: modelMessages, systemPrompts } = await traceAsync(
        "assistant.attachments.resolve",
        "io",
        { threadMessageCount: threadMessages.length },
        () => buildModelMessages(workspace.id, threadMessages, ctx.access, ctx.env),
      );
      if (searchTool) {
        systemPrompts.push(getSearchToolSystemPrompt(searchLimit));
      }
      if (extractTool) {
        systemPrompts.push(EXTRACT_TOOL_SYSTEM_PROMPT);
      }

      const now = new Date();
      const datePrompt = `Current date: ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. When searching for current/recent information, use this date as reference—do not default to years from your training data.`;
      systemPrompts.push(datePrompt);

      const adapter = createChatCompletionsAdapter(
        {
          baseUrl: OPENCODE_GO_BASE_URL,
          apiKey: ctx.env.OPENCODE_GO_API_KEY,
          trace: (name, kind, attrs, run) => traceAsync(name, kind, attrs, run),
        },
        modelId,
      );
      const providerOptions = await traceSync(
        "assistant.provider.options",
        "model",
        {
          modelId,
          reasoningLevel: payload.reasoningLevel,
          toolCount,
          searchEnabled: payload.search,
          extractToolConfigured,
        },
        () =>
          getProviderModelOptions(
            modelId,
            toolCount,
            payload.reasoningLevel,
            payload.modelInterleavedField,
          ),
      );
      const modelOptions = providerOptions.modelOptions;

      if (!modelOptions && payload.reasoningLevel !== "off") {
        syncLog("reasoning_mapping_unavailable", {
          assistantMessageId: payload.assistantMessage.id,
          modelId,
          requestedReasoningLevel: payload.reasoningLevel,
        });
      }

      syncLog("assistant_turn_upstream", {
        assistantMessageId: payload.assistantMessage.id,
        modelId,
        messageCount: modelMessages.length,
        systemPromptCount: systemPrompts.length,
        toolCount,
        toolNames: activeTools.map((tool) => (tool as { name?: string }).name ?? "unknown"),
        modelInterleavedField: payload.modelInterleavedField ?? null,
        requestedReasoningLevel: payload.reasoningLevel,
        effectiveReasoningLevel: providerOptions.effectiveReasoningLevel,
        overrideReason: providerOptions.overrideReason,
        modelOptions,
      });

      const consumerDeps: StreamConsumerDeps = {
        appendServerEvent: (opId, eventType, eventPayload) =>
          ctx.eventStore.appendServerEvent(opId, eventType as SyncEventType, eventPayload as any),
        broadcast: (envelope) => ctx.broadcast(envelope),
        appendMessagePart,
        rawAppendMessagePart,
        setCommitPendingText: (fn) => {
          commitPendingText = fn;
        },
        reportActivity,
        messageId: payload.assistantMessage.id,
        suppressReasoningTokens: providerOptions.effectiveReasoningLevel === "off",
        log: syncLog,
        trace: (name, kind, attrs, run) => traceAsync(name, kind, attrs, run),
      };

      const agentLoopStrategy =
        toolCount > 0
          ? combineStrategies([
              maxIterations(MAX_TOOL_ITERATIONS_PER_TURN),
              untilFinishReason(["stop", "length", "content_filter"]),
            ])
          : maxIterations(1);

      const stream = chat({
        adapter,
        messages: modelMessages as any,
        systemPrompts,
        agentLoopStrategy,
        abortController,
        ...(modelOptions ? { modelOptions } : {}),
        ...(activeTools.length ? { tools: activeTools } : {}),
      });

      const result = await traceAsync("assistant.stream.consume", "io", { modelId }, () =>
        consumeAssistantStream(stream, consumerDeps),
      );
      const searchRuns = searchTool?.state.searchRuns ?? [];
      const extractRuns = extractTool?.state.extractRuns ?? [];

      syncLog("assistant_turn_search_summary", {
        assistantMessageId: payload.assistantMessage.id,
        toolCallIterations: result.toolCallIterations,
        toolNamesUsed: result.toolNamesUsed,
        searchRuns: searchRuns.map((run) => ({
          step: run.step,
          query: run.query,
          status: run.status,
          resultCount: run.resultCount,
        })),
        extractRuns: extractRuns.map((run) => ({
          step: run.step,
          url: run.url,
          status: run.status,
          originalLength: run.originalLength ?? null,
          truncated: run.truncated ?? null,
        })),
      });
      syncLog("assistant_turn_answer_sanity", {
        assistantMessageId: payload.assistantMessage.id,
        searched: searchRuns.length > 0,
        toolCallIterations: result.toolCallIterations,
        likelyIgnoredGrounding:
          searchRuns.length > 0 && looksLikeMissingRealtimeAccess(result.text),
        answerPreview: previewText(result.text),
      });
      await recorder.finishSpan({
        spanId: rootSpanId,
        status: "completed",
        attrs: {
          searchRunCount: searchRuns.length,
          toolCallIterations: result.toolCallIterations,
          answerPreview: previewText(result.text),
        },
      });
      await recorder.finishTraceRun({
        traceRunId: traceContext.traceRunId,
        status: "completed",
        attrs: {
          resultTextLength: result.text.length,
          searchRunCount: searchRuns.length,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const normalizedError = normalizeAssistantError({
        errorCode: "assistant_turn_error",
        errorMessage,
        modelId,
      });
      syncLog("assistant_turn_exception", {
        assistantMessageId: payload.assistantMessage.id,
        modelId,
        search: payload.search,
        error: errorMessage,
        normalizedErrorCode: normalizedError.errorCode,
        providerName: normalizedError.providerName,
        retryable: normalizedError.retryable,
        stack: error instanceof Error ? error.stack : undefined,
      });

      const current = ctx.access.getMessage(payload.assistantMessage.id);
      if (current && current.status !== "completed" && current.status !== "failed") {
        const failed = await ctx.eventStore.appendServerEvent(null, "message_failed", {
          messageId: payload.assistantMessage.id,
          errorCode: normalizedError.errorCode,
          errorMessage: normalizedError.errorMessage,
          updatedAt: nowIso(),
        });
        ctx.broadcast(failed);

        await appendMessagePart("activity", {
          text: "Response failed",
          json: json({
            label: "Response failed",
            state: "failed",
            detail: normalizedError.errorMessage,
          } satisfies ToolProgressEvent),
        });
      }
      await recorder.finishSpan({
        spanId: rootSpanId,
        status: normalizedError.errorCode === "cancelled" ? "cancelled" : "failed",
        errorCode: normalizedError.errorCode,
        errorMessage: normalizedError.errorMessage,
      });
      await recorder.finishTraceRun({
        traceRunId: traceContext.traceRunId,
        status: normalizedError.errorCode === "cancelled" ? "cancelled" : "failed",
        errorCode: normalizedError.errorCode,
        errorMessage: normalizedError.errorMessage,
      });
    }
  } finally {
    const finalMessage = ctx.access.getMessage(payload.assistantMessage.id);
    syncLog("CHAT_DEBUG_STUCK_GENERATING_assistant_turn_finally", {
      assistantMessageId: payload.assistantMessage.id,
      threadId: payload.threadId,
      finalStatus: finalMessage?.status ?? null,
      finalTextLength: finalMessage?.text.length ?? null,
      controllerStillRegistered: ctx.assistantTurnControllers.has(payload.assistantMessage.id),
    });
    ctx.assistantTurnControllers.delete(payload.assistantMessage.id);
  }
}
