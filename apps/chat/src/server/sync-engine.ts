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
import { SyncEngineDO, type HandlerContext } from "@shedflare/sync-protocol";
import { json, parseJsonRequest, parseInternalCommandBody, syncLog } from "./sync-utils";
import { initializeStorage } from "./schema";
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
  type CommandHandlerResult,
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

  constructor(ctx: DurableObjectState, env: AppEnv) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema: dbSchema, logger: false });
    this.chatAccess = new DataAccess(this.access, this.db);
    this.eventStore = new EventStore(this.chatAccess);
    this.registerChatHandlers();

    const raw = env as unknown as Record<string, unknown>;
    void ctx.blockConcurrencyWhile(async () => {
      for (const key of ["OPENCODE_GO_API_KEY", "UPLOAD_TOKEN_SECRET", "EXA_API_KEY"] as const) {
        const binding = raw[key];
        if (
          binding &&
          typeof binding === "object" &&
          "get" in binding &&
          typeof (binding as { get(): Promise<string> }).get === "function"
        ) {
          raw[key] = await (binding as { get(): Promise<string> }).get();
        }
      }
      initializeStorage(
        (query, ...params) => {
          ctx.storage.sql.exec(query, ...params);
        },
        <T extends Record<string, unknown>>(query: string, ...params: any[]): T | null => {
          const rows = ctx.storage.sql.exec(query, ...params).toArray() as T[];
          return rows[0] ?? null;
        },
        (message) => syncLog(message),
      );
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
    return (this.db as any).transaction(fn);
  }

  // ─── Fetch ──────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
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

    return new Response("Not found", { status: 404 });
  }

  // ─── WebSocket ──────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let envelope: any;
    try {
      envelope = JSON.parse(text);
    } catch {
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
        case "ping":
          ws.send(json({ type: "pong", at: nowIso() }));
          break;
        case "command":
          await this.processChatCommand(
            envelope.opId,
            envelope.commandType,
            envelope.payload,
            true,
          );
          break;
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

  async webSocketClose(_ws: WebSocket) {
    if (this.activeTurnMessageIds.size > 0) {
      syncLog("ws_close_pending_turns", {
        count: this.activeTurnMessageIds.size,
        ids: [...this.activeTurnMessageIds],
      });
      void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }

  // ─── Alarm ──────────────────────────────────────────────────────

  async alarm() {
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

      followUpPromise
        .then(() => {
          this.activeTurnMessageIds.delete(turnMessageId);
          this.clearTurnParams(turnMessageId);
          void this.ctx.storage.deleteAlarm().catch(() => {});
          syncLog("turn_params_cleared", { messageId: turnMessageId });
          return undefined;
        })
        .catch((error: any) => {
          this.activeTurnMessageIds.delete(turnMessageId);
          syncLog("follow_up_error", {
            opId,
            commandType,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        });

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
        void this.ctx.storage.deleteAlarm().catch(() => {});
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
