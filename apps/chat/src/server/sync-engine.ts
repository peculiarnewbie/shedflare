import {
  SYNC_PROTOCOL_VERSION,
  createId,
  decodeCommand,
  isTurnCommand,
  nowIso,
  type Message,
  type SyncCommandPayloadMap,
  type SyncCommandType,
  type SyncServerAck,
  type SyncServerEnvelope,
  type SyncServerEvent,
  type SyncSnapshot,
} from "#/domain";
import { getDefaultModelId, type AppEnv } from "#/runtime";
import * as dbSchema from "#/db/schema";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { eq } from "drizzle-orm";
import { SyncEngineDO } from "@shedflare/sync-protocol";
import { json, parseJsonRequest, parseInternalCommandBody, syncLog } from "./sync-utils";
import migrationManifest from "../../drizzle/migrations";
import { runMigrations } from "./migrator";
import { resetForProtocolVersion } from "./schema-helpers";
import { DataAccess } from "./data-access";
import { EventStore } from "./event-store";
import {
  handleBootstrapSession,
  handleUpdateAccountSettings,
  handleCreateWorkspace,
  handleUpdateWorkspace,
  handleArchiveWorkspace,
  handleUpsertThread,
  handleArchiveThread,
  handleCreateUserMessage,
  handleRetryMessage,
  handleEditUserMessage,
  handleStartAssistantTurn,
  handleCancelAssistantTurn,
  handleDeleteThread,
  handleForkThread,
  handleUpsertAttachment,
  handleDeleteAttachment,
  handleSetSearchMode,
  handleResetStorage,
  handleCreateComparison,
  type DeferredFollowUp,
  type CommandHandlerContext,
  type AssistantTurnPayload,
  type TitleGenerationPayload,
} from "./command-handlers";
import { runAssistantTurn } from "./assistant-turn";
import { generateThreadTitle } from "./title-generator";

type ChatHandlerFn = (
  opId: string,
  payload: SyncCommandPayloadMap[SyncCommandType],
  ctx: CommandHandlerContext,
) => { events: SyncServerEvent[]; followUp?: DeferredFollowUp };

type SyncCommandResult = {
  ack?: SyncServerAck;
  events: SyncServerEvent[];
  followUp?: Promise<void>;
};

type SavedTurnParams = {
  messageId: string;
  threadId: string;
  userMessageId: string;
  modelId: string;
  modelInterleavedField: string | null;
  reasoningLevel: "off" | "low" | "medium" | "high";
  search: boolean;
  searchLimit: number;
  preferFreeSearch: boolean;
};

const ALARM_INTERVAL_MS = 30_000;

const STUCK_DEBUG_PREFIX = "CHAT_DEBUG_STUCK_GENERATING";

function envelopeDebugSummary(envelope: SyncServerEnvelope) {
  if (envelope.type !== "event") {
    return { type: envelope.type };
  }
  const payload = envelope.payload as Record<string, unknown>;
  return {
    type: envelope.type,
    eventType: envelope.eventType,
    serverSeq: envelope.serverSeq,
    eventId: envelope.eventId,
    messageId: typeof payload.messageId === "string" ? payload.messageId : null,
    textLength: typeof payload.text === "string" ? payload.text.length : null,
    deltaLength: typeof payload.delta === "string" ? payload.delta.length : null,
    rowId:
      payload.row && typeof payload.row === "object" && "id" in payload.row
        ? String(payload.row.id)
        : null,
  };
}

function shouldLogBroadcast(envelope: SyncServerEnvelope) {
  if (envelope.type !== "event") return true;
  if (envelope.eventType !== "message_delta") return true;
  return envelope.serverSeq % 25 === 0;
}

// ---------------------------------------------------------------------------
// SyncEngineDurableObject
// ---------------------------------------------------------------------------

export class SyncEngineDurableObject extends SyncEngineDO<AppEnv> {
  private readonly db: DrizzleSqliteDODatabase<typeof dbSchema>;
  private readonly chatAccess: DataAccess;
  private readonly eventStore: EventStore;
  private readonly assistantTurnControllers = new Map<string, AbortController>();
  private readonly activeTurnMessageIds = new Set<string>();
  private readonly chatHandlers = new Map<SyncCommandType, ChatHandlerFn>();
  private readonly initialized: Promise<void>;

  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema: dbSchema, logger: false });
    this.chatAccess = new DataAccess(this.access, this.db);
    this.eventStore = new EventStore(this.chatAccess);
    this.registerChatHandlers();

    this.initialized = ctx.blockConcurrencyWhile(async () => {
      syncLog("migrate_start");
      runMigrations(this.db, migrationManifest);
      syncLog("migrate_done");

      const version = this.access.queryOne<{ value: string }>(
        `SELECT value FROM metadata WHERE key = 'sync_protocol_version'`,
      );
      if (version?.value !== SYNC_PROTOCOL_VERSION) {
        syncLog("protocol_version_reset", {
          previous: version?.value ?? null,
          current: SYNC_PROTOCOL_VERSION,
        });
        this.db.transaction(() => {
          resetForProtocolVersion((query, ...params) => {
            this.ctx.storage.sql.exec(query, ...params);
          });
          this.ctx.storage.sql.exec(
            `INSERT OR REPLACE INTO metadata (key, value) VALUES ('sync_protocol_version', ?)`,
            SYNC_PROTOCOL_VERSION,
          );
        });
      }
    });
  }

  get protocolVersion(): string {
    return SYNC_PROTOCOL_VERSION;
  }

  registerHandlers(_registry: any): void {
    // Handlers registered via chatHandlers typed Map — no as any needed
  }

  private registerChatHandlers(): void {
    const handlers: [SyncCommandType, ChatHandlerFn][] = [
      ["bootstrap_session", handleBootstrapSession as ChatHandlerFn],
      ["update_account_settings", handleUpdateAccountSettings as ChatHandlerFn],
      ["create_workspace", handleCreateWorkspace as ChatHandlerFn],
      ["update_workspace", handleUpdateWorkspace as ChatHandlerFn],
      ["archive_workspace", handleArchiveWorkspace as ChatHandlerFn],
      ["create_thread", handleUpsertThread as ChatHandlerFn],
      ["update_thread", handleUpsertThread as ChatHandlerFn],
      ["archive_thread", handleArchiveThread as ChatHandlerFn],
      ["create_user_message", handleCreateUserMessage as ChatHandlerFn],
      ["retry_message", handleRetryMessage as ChatHandlerFn],
      ["edit_user_message", handleEditUserMessage as ChatHandlerFn],
      ["start_assistant_turn", handleStartAssistantTurn as ChatHandlerFn],
      ["cancel_assistant_turn", handleCancelAssistantTurn as ChatHandlerFn],
      ["register_attachment", handleUpsertAttachment as ChatHandlerFn],
      ["complete_attachment", handleUpsertAttachment as ChatHandlerFn],
      ["update_attachment", handleUpsertAttachment as ChatHandlerFn],
      ["delete_attachment", handleDeleteAttachment as ChatHandlerFn],
      ["delete_thread", handleDeleteThread as ChatHandlerFn],
      ["fork_thread", handleForkThread as ChatHandlerFn],
      ["create_comparison", handleCreateComparison as ChatHandlerFn],
      ["set_search_mode", handleSetSearchMode as ChatHandlerFn],
      ["reset_storage", handleResetStorage as ChatHandlerFn],
    ];
    for (const [type, handler] of handlers) {
      this.chatHandlers.set(type, handler);
    }
  }

  getSnapshot(): SyncSnapshot {
    return this.chatAccess.getSnapshot();
  }

  protected executeTransaction<T>(fn: () => T): T {
    return (this.db as { transaction<T>(fn: () => T): T }).transaction(fn);
  }

  // ─── Fetch ──────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    await this.initialized;
    const url = new URL(request.url);
    syncLog("fetch", { path: url.pathname, method: request.method });

    if (url.pathname === "/ws") {
      return super.fetch(request);
    }

    if (url.pathname === "/internal/command" && request.method === "POST") {
      const jsonBody = await parseJsonRequest(request);
      if (jsonBody instanceof Response) return jsonBody;
      const body = parseInternalCommandBody(jsonBody);
      if (body instanceof Response) return body;
      syncLog("internal_command", { opId: body.opId, commandType: body.commandType });
      const result = await this.processChatCommand(body.opId, body.commandType, body.payload, true);
      return Response.json({ ok: true, ack: result.ack });
    }

    if (url.pathname === "/internal/snapshot") {
      return Response.json(this.getSnapshot());
    }

    if (url.pathname === "/backup/export" && request.method === "POST") {
      const body = await parseJsonRequest(request);
      if (body instanceof Response) return body;
      const bodyRecord =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : null;
      const createdAt =
        bodyRecord && typeof bodyRecord.createdAt === "string" ? bodyRecord.createdAt : nowIso();
      return Response.json(
        this.chatAccess.getBackup({ createdAt, protocolVersion: SYNC_PROTOCOL_VERSION }),
      );
    }

    if (url.pathname === "/history/threads" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") ?? "");
      return Response.json(
        this.chatAccess.getThreadSummaryPage({
          workspaceId: url.searchParams.get("workspaceId"),
          before: url.searchParams.get("before"),
          limit: Number.isFinite(limit) ? limit : undefined,
          includeArchived: url.searchParams.get("includeArchived") === "true",
        }),
      );
    }

    const threadDetailMatch = url.pathname.match(/^\/history\/threads\/([^/]+)$/);
    if (threadDetailMatch && request.method === "GET") {
      const snapshot = this.chatAccess.getThreadDetailSnapshot(
        decodeURIComponent(threadDetailMatch[1]!),
        {
          includeSearch: url.searchParams.get("includeSearch") !== "false",
          includeTrace: url.searchParams.get("includeTrace") === "true",
        },
      );
      if (!snapshot) return new Response("Thread not found", { status: 404 });
      return Response.json(snapshot);
    }

    const messageTraceMatch = url.pathname.match(/^\/history\/messages\/([^/]+)\/trace$/);
    if (messageTraceMatch && request.method === "GET") {
      return Response.json(
        this.chatAccess.getMessageTraceSnapshot(decodeURIComponent(messageTraceMatch[1]!)),
      );
    }

    return new Response("Not found", { status: 404 });
  }

  // ─── WebSocket ──────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.initialized;
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let envelope: any;
    try {
      envelope = JSON.parse(text);
    } catch {
      syncLog("ws_message_parse_error", { text: text.slice(0, 200) });
      return;
    }

    syncLog("ws_message", { type: envelope.type });

    try {
      switch (envelope.type) {
        case "hello":
          await this.handleHello(ws, envelope);
          break;
        case "resume":
          await this.replayAfter(ws, envelope.lastServerSeq);
          break;
        case "command":
          await this.processChatCommand(
            envelope.opId,
            envelope.commandType,
            envelope.payload,
            true,
          );
          break;
        default:
          syncLog("ws_message_unknown_type", { type: envelope.type });
      }
    } catch (error) {
      syncLog("ws_message_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      ws.send(
        JSON.stringify({
          type: "sync_reset",
          reason: error instanceof Error ? error.message : String(error),
          protocolVersion: SYNC_PROTOCOL_VERSION,
          snapshot: this.getSnapshot(),
        }),
      );
    }
  }

  async webSocketClose(_ws: WebSocket, code?: number, reason?: string, wasClean?: boolean) {
    await this.initialized;
    syncLog(`${STUCK_DEBUG_PREFIX}_server_ws_close`, {
      code: code ?? null,
      reason: reason ?? null,
      wasClean: wasClean ?? null,
      activeTurnCount: this.activeTurnMessageIds.size,
      activeTurnMessageIds: [...this.activeTurnMessageIds],
    });
    if (this.activeTurnMessageIds.size > 0) {
      syncLog("ws_close_pending_turns", {
        count: this.activeTurnMessageIds.size,
        ids: [...this.activeTurnMessageIds],
      });
      void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }

  protected broadcast(envelope: SyncServerEnvelope): void {
    const message = JSON.stringify(envelope);
    const sockets = this.ctx.getWebSockets();
    const shouldLog = shouldLogBroadcast(envelope);
    if (shouldLog) {
      syncLog(`${STUCK_DEBUG_PREFIX}_server_broadcast_attempt`, {
        ...envelopeDebugSummary(envelope),
        socketCount: sockets.length,
        jsonBytes: new TextEncoder().encode(message).length,
      });
    }

    let sent = 0;
    let failed = 0;
    for (const socket of sockets) {
      try {
        socket.send(message);
        sent += 1;
      } catch (error) {
        failed += 1;
        syncLog(`${STUCK_DEBUG_PREFIX}_server_broadcast_send_error`, {
          ...envelopeDebugSummary(envelope),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (shouldLog) {
      syncLog(`${STUCK_DEBUG_PREFIX}_server_broadcast_result`, {
        ...envelopeDebugSummary(envelope),
        sent,
        failed,
      });
    }
  }

  // ─── Alarm ──────────────────────────────────────────────────────

  async alarm() {
    await this.initialized;
    syncLog("alarm_fired");
    const turns = this.loadAllTurnParams();
    if (turns.size === 0) {
      syncLog("alarm_no_pending_turns");
      return;
    }

    for (const [messageId, params] of turns) {
      if (this.activeTurnMessageIds.has(messageId)) {
        syncLog("alarm_turn_still_active", { messageId });
        void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
        continue;
      }

      const message = this.chatAccess.getMessage(messageId);
      if (!message || message.status === "completed" || message.status === "failed") {
        syncLog("alarm_cleaning_stale_turn", {
          messageId,
          status: message?.status ?? "gone",
        });
        this.clearTurnParams(messageId);
        continue;
      }

      syncLog("alarm_recovering_turn", {
        messageId,
        threadId: params.threadId,
        status: message.status,
      });
      await this.recoverTurn(messageId, params);
    }
  }

  // ─── Hello ──────────────────────────────────────────────────────

  protected async handleHello(ws: WebSocket, hello: any): Promise<void> {
    syncLog("hello", {
      clientId: hello.clientId,
      lastServerSeq: hello.lastServerSeq,
      unackedOpIds: hello.unackedOpIds?.length,
    });
    await this.ensureBootstrapped();
    await super.handleHello(ws, hello);
  }

  // ─── Chat command processing ────────────────────────────────────

  private async processChatCommand<T extends SyncCommandType>(
    opId: string,
    commandType: T,
    payload: SyncCommandPayloadMap[T],
    doBroadcast: boolean,
  ): Promise<SyncCommandResult> {
    syncLog("process_command_start", { opId, commandType, doBroadcast });

    const existing = this.access.getCommandAck(opId);
    if (existing) {
      syncLog("process_command_duplicate", { opId, commandType });
      return { ack: existing as SyncServerAck, events: [] };
    }

    const handler = this.chatHandlers.get(commandType);
    if (!handler) {
      throw new Error(`Unknown command type: ${commandType}`);
    }

    const createdAt = nowIso();
    const handlerContext = this.buildHandlerContext();
    const validatedPayload = decodeCommand(commandType, payload) as SyncCommandPayloadMap[T];

    const transactionResult = this.db.transaction(() => {
      const result = handler(opId, validatedPayload, handlerContext);

      const ackedSeq = result.events.at(-1)?.serverSeq ?? this.access.getLastServerSeq();
      const ack: SyncServerAck = {
        type: "ack",
        opId,
        serverSeq: ackedSeq,
        acceptedAt: createdAt,
        commandType,
      };
      this.db
        .insert(dbSchema.commands)
        .values({
          opId,
          type: commandType,
          status: "accepted",
          responseJson: json(ack),
          createdAt,
          ackedSeq,
        })
        .run();
      return { ack, events: result.events, followUp: result.followUp };
    });

    syncLog("process_command_committed", {
      opId,
      commandType,
      eventCount: transactionResult.events.length,
      ackedSeq: transactionResult.ack.serverSeq,
      hasFollowUp: Boolean(transactionResult.followUp),
    });

    if (doBroadcast) {
      this.broadcast(transactionResult.ack as SyncServerEnvelope);
      for (const event of transactionResult.events) this.broadcast(event as SyncServerEnvelope);
    }

    const followUpPromise = transactionResult.followUp?.();

    if (followUpPromise && isTurnCommand(commandType)) {
      if (commandType === "create_comparison") {
        const comparisonPayload = validatedPayload as SyncCommandPayloadMap["create_comparison"];
        for (let i = 0; i < comparisonPayload.assistantMessages.length; i++) {
          const assistantMsg = comparisonPayload.assistantMessages[i];
          const userMsg = comparisonPayload.userMessages[i];
          const thread = comparisonPayload.threads[i];
          this.saveTurnParams(assistantMsg.id, {
            messageId: assistantMsg.id,
            threadId: thread.id,
            userMessageId: userMsg.id,
            modelId: comparisonPayload.modelIds[i],
            modelInterleavedField: comparisonPayload.modelInterleavedFields[i] ?? null,
            reasoningLevel: comparisonPayload.reasoningLevel,
            search: comparisonPayload.search,
            searchLimit: comparisonPayload.searchLimit ?? 5,
            preferFreeSearch: comparisonPayload.preferFreeSearch ?? false,
          });
          this.activeTurnMessageIds.add(assistantMsg.id);
        }
        void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
        syncLog("comparison_turn_params_saved", {
          count: comparisonPayload.assistantMessages.length,
          threadIds: comparisonPayload.threads.map((t) => t.id),
        });

        followUpPromise
          .then(() => {
            for (const msg of comparisonPayload.assistantMessages) {
              this.activeTurnMessageIds.delete(msg.id);
              this.clearTurnParams(msg.id);
            }
            void this.ctx.storage.deleteAlarm().catch(() => syncLog("alarm_delete_failed"));
            syncLog("comparison_turn_params_cleared");
            return undefined;
          })
          .catch((error: any) => {
            for (const msg of comparisonPayload.assistantMessages) {
              this.activeTurnMessageIds.delete(msg.id);
            }
            syncLog("follow_up_error", {
              opId,
              commandType,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
          });
      } else {
        const turnPayload = validatedPayload as SyncCommandPayloadMap[
          | "create_user_message"
          | "retry_message"
          | "edit_user_message"];
        const turnMessageId = turnPayload.assistantMessage.id;
        const userMessageId = "userMessage" in turnPayload ? turnPayload.userMessage.id : "";

        this.saveTurnParams(turnMessageId, {
          messageId: turnMessageId,
          threadId: turnPayload.threadId,
          userMessageId,
          modelId: turnPayload.modelId,
          modelInterleavedField: turnPayload.modelInterleavedField ?? null,
          reasoningLevel: turnPayload.reasoningLevel,
          search: turnPayload.search,
          searchLimit: turnPayload.searchLimit ?? 5,
          preferFreeSearch: turnPayload.preferFreeSearch ?? false,
        });
        this.activeTurnMessageIds.add(turnMessageId);
        void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
        syncLog("turn_params_saved", { messageId: turnMessageId, threadId: turnPayload.threadId });
        syncLog(`${STUCK_DEBUG_PREFIX}_turn_followup_tracking_started`, {
          opId,
          commandType,
          messageId: turnMessageId,
          threadId: turnPayload.threadId,
          modelId: turnPayload.modelId,
          activeTurnMessageIds: [...this.activeTurnMessageIds],
        });

        followUpPromise
          .then(() => {
            const message = this.chatAccess.getMessage(turnMessageId);
            syncLog(`${STUCK_DEBUG_PREFIX}_turn_followup_resolved`, {
              opId,
              commandType,
              messageId: turnMessageId,
              finalStatus: message?.status ?? null,
              finalTextLength: message?.text.length ?? null,
            });
            this.activeTurnMessageIds.delete(turnMessageId);
            this.clearTurnParams(turnMessageId);
            void this.ctx.storage
              .deleteAlarm()
              .catch(() => syncLog("alarm_delete_failed", { messageId: turnMessageId }));
            syncLog("turn_params_cleared", { messageId: turnMessageId });
            return undefined;
          })
          .catch((error: any) => {
            const message = this.chatAccess.getMessage(turnMessageId);
            this.activeTurnMessageIds.delete(turnMessageId);
            syncLog("follow_up_error", {
              opId,
              commandType,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            });
            syncLog(`${STUCK_DEBUG_PREFIX}_turn_followup_rejected`, {
              opId,
              commandType,
              messageId: turnMessageId,
              finalStatus: message?.status ?? null,
              finalTextLength: message?.text.length ?? null,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }

      this.ctx.waitUntil(followUpPromise);
    } else if (followUpPromise) {
      followUpPromise.catch((error: any) => {
        syncLog("follow_up_error", {
          opId,
          commandType,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      });
      this.ctx.waitUntil(followUpPromise);
    }

    return {
      ack: transactionResult.ack,
      events: transactionResult.events,
      followUp: followUpPromise,
    };
  }

  // ─── Handler context ────────────────────────────────────────────

  private buildHandlerContext(): CommandHandlerContext {
    return {
      access: this.chatAccess,
      eventStore: this.eventStore,
      env: this.env,
      assistantTurnControllers: this.assistantTurnControllers,
      runAssistantTurn: (payload: AssistantTurnPayload) =>
        runAssistantTurn(payload, {
          access: this.chatAccess,
          eventStore: this.eventStore,
          env: this.env,
          broadcast: (e) => this.broadcast(e),
          assistantTurnControllers: this.assistantTurnControllers,
        }),
      generateThreadTitle: (input: TitleGenerationPayload) =>
        generateThreadTitle(input, {
          access: this.chatAccess,
          eventStore: this.eventStore,
          env: this.env,
          broadcast: (e) => this.broadcast(e),
        }),
    };
  }

  // ─── Turn recovery ──────────────────────────────────────────────

  private saveTurnParams(messageId: string, params: SavedTurnParams) {
    this.db
      .insert(dbSchema.pendingTurns)
      .values({
        messageId,
        payloadJson: JSON.stringify(params),
        createdAt: nowIso(),
      })
      .run();
  }

  private clearTurnParams(messageId: string) {
    this.db
      .delete(dbSchema.pendingTurns)
      .where(eq(dbSchema.pendingTurns.messageId, messageId))
      .run();
  }

  private loadAllTurnParams(): Map<string, SavedTurnParams> {
    const rows = this.db.select().from(dbSchema.pendingTurns).all();
    const result = new Map<string, SavedTurnParams>();
    for (const row of rows) {
      try {
        const params = JSON.parse(row.payloadJson) as SavedTurnParams;
        result.set(row.messageId, params);
      } catch {
        syncLog("invalid_pending_turn", { messageId: row.messageId });
      }
    }
    return result;
  }

  private async recoverTurn(staleMessageId: string, params: SavedTurnParams): Promise<void> {
    const thread = this.chatAccess.getThread(params.threadId);
    if (!thread) {
      syncLog("recover_turn_thread_not_found", { threadId: params.threadId });
      this.clearTurnParams(staleMessageId);
      return;
    }

    const userMessage = this.chatAccess.getMessage(params.userMessageId);
    if (!userMessage) {
      syncLog("recover_turn_user_message_not_found", { userMessageId: params.userMessageId });
      this.clearTurnParams(staleMessageId);
      return;
    }

    const { createMessage } = await import("#/domain");
    const newAssistantMessage = createMessage({
      threadId: params.threadId,
      parentMessageId: userMessage.id,
      role: "assistant",
      modelId: params.modelId,
      reasoningLevel: params.reasoningLevel,
      text: "",
      searchEnabled: params.search,
      status: "pending",
    });
    const { normalizeMessage } = await import("./data-access");
    const normalized = normalizeMessage(newAssistantMessage, createId("srvop"));
    const newMessageId = normalized.id;

    this.saveTurnParams(newMessageId, { ...params, messageId: newMessageId });
    this.activeTurnMessageIds.add(newMessageId);
    void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);

    const recoveredAt = nowIso();
    const failEvent = this.eventStore.insertEvent(createId("srvop"), "message_failed", {
      messageId: staleMessageId,
      errorCode: "interrupted",
      errorMessage: "Response interrupted (DO restarted) — recovering...",
      updatedAt: recoveredAt,
    });
    this.broadcast(failEvent as SyncServerEnvelope);

    const threadEvent = this.eventStore.insertEvent(createId("srvop"), "thread_upserted", {
      row: {
        ...thread,
        headMessageId: newMessageId,
        updatedAt: recoveredAt,
        lastMessageAt: recoveredAt,
      },
    });
    this.broadcast(threadEvent as SyncServerEnvelope);

    const msgEvent = this.eventStore.insertEvent(createId("srvop"), "message_upserted", {
      row: normalized,
    });
    this.broadcast(msgEvent as SyncServerEnvelope);

    syncLog("recover_turn_starting", { staleMessageId, newMessageId, threadId: params.threadId });

    try {
      await this.runRecoveredTurn(params.threadId, userMessage, normalized, params);
    } finally {
      this.activeTurnMessageIds.delete(newMessageId);
      const refreshed = this.chatAccess.getMessage(newMessageId);
      if (refreshed && (refreshed.status === "completed" || refreshed.status === "failed")) {
        this.clearTurnParams(newMessageId);
        void this.ctx.storage
          .deleteAlarm()
          .catch(() => syncLog("alarm_delete_failed", { messageId: newMessageId }));
      }
    }
  }

  private async runRecoveredTurn(
    threadId: string,
    userMessage: Message,
    assistantMessage: Message,
    params: SavedTurnParams,
  ) {
    const thread = this.chatAccess.getThread(threadId);
    if (!thread) return;

    await runAssistantTurn(
      {
        threadId,
        thread,
        userMessage,
        assistantMessage,
        modelId: params.modelId,
        modelInterleavedField: params.modelInterleavedField,
        reasoningLevel: params.reasoningLevel,
        search: params.search,
        searchLimit: params.searchLimit,
        preferFreeSearch: params.preferFreeSearch,
      },
      {
        access: this.chatAccess,
        eventStore: this.eventStore,
        env: this.env,
        broadcast: (e) => this.broadcast(e),
        assistantTurnControllers: this.assistantTurnControllers,
      },
    );
  }

  // ─── Bootstrap ──────────────────────────────────────────────────

  private async ensureBootstrapped() {
    const existing = this.chatAccess.queryOne<{ count: number }>(
      "SELECT count(*) as count FROM workspaces",
    );
    if (Number(existing?.count ?? 0) === 0) {
      await this.processChatCommand(
        createId("bootstrap"),
        "bootstrap_session",
        { defaultModelId: getDefaultModelId(this.env) },
        false,
      );
      return;
    }

    if (!this.chatAccess.getAccountSettings()) {
      const { createAccountSettings } = await import("#/domain");
      const { normalizeAccountSettings } = await import("./data-access");
      const settings = createAccountSettings({ id: "default" });
      const event = await this.eventStore.appendServerEvent(null, "account_settings_upserted", {
        row: normalizeAccountSettings(settings, createId("srvop")),
      });
      this.broadcast(event as SyncServerEnvelope);
    }
  }
}
