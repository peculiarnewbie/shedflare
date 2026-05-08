import {
  SYNC_PROTOCOL_VERSION,
  createId,
  nowIso,
  type SyncClientEnvelope,
  type SyncClientHello,
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
import { decodeAppEnv } from "#/effect";
import {
  json,
  parseJson,
  parseJsonRequest,
  parseInternalCommandBody,
  isWebSocketRequest,
  syncLog,
} from "./sync-utils";
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
  type DeferredFollowUp,
  type CommandHandlerContext,
  type AssistantTurnPayload,
  type TitleGenerationPayload,
} from "./command-handlers";
import { runAssistantTurn } from "./assistant-turn";
import { generateThreadTitle } from "./title-generator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyncCommandResult = {
  ack?: SyncServerAck;
  events: SyncServerEvent[];
  followUp?: Promise<void>;
};

type CommandHandlerFn = (
  opId: string,
  payload: any,
  ctx: CommandHandlerContext,
) => { events: SyncServerEvent[]; followUp?: DeferredFollowUp };

/** Params persisted to the pending_turns table so we can recover if the DO
 *  is evicted mid-turn. Everything needed to reconstruct and re-run the turn. */
type SavedTurnParams = {
  /** Assistant message ID — also the pending_turns primary key. */
  messageId: string;
  threadId: string;
  /** ID of the user message that this turn responds to. */
  userMessageId: string;
  modelId: string;
  modelInterleavedField: string | null;
  reasoningLevel: string;
  search: boolean;
  searchLimit: number;
  preferFreeSearch: boolean;
};

/** Alarm interval in ms. When the DO is evicted mid-turn, this alarm fires
 *  and recovery kicks in. Also acts as a keepalive — if the alarm fires while
 *  the turn is still running (activeTurnMessageIds has the ID), we re-set it. */
const ALARM_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Command handler registry
// ---------------------------------------------------------------------------

function buildHandlerRegistry(): Map<SyncCommandType, CommandHandlerFn> {
  return new Map<SyncCommandType, CommandHandlerFn>([
    ["bootstrap_session", handleBootstrapSession as CommandHandlerFn],
    ["update_account_settings", handleUpdateAccountSettings as CommandHandlerFn],
    ["create_workspace", handleCreateWorkspace as CommandHandlerFn],
    ["update_workspace", handleUpdateWorkspace as CommandHandlerFn],
    ["archive_workspace", handleArchiveWorkspace as CommandHandlerFn],
    ["create_thread", handleUpsertThread as CommandHandlerFn],
    ["update_thread", handleUpsertThread as CommandHandlerFn],
    ["archive_thread", handleArchiveThread as CommandHandlerFn],
    ["create_user_message", handleCreateUserMessage as CommandHandlerFn],
    ["retry_message", handleRetryMessage as CommandHandlerFn],
    ["edit_user_message", handleEditUserMessage as CommandHandlerFn],
    ["start_assistant_turn", handleStartAssistantTurn as CommandHandlerFn],
    ["cancel_assistant_turn", handleCancelAssistantTurn as CommandHandlerFn],
    ["register_attachment", handleUpsertAttachment as CommandHandlerFn],
    ["complete_attachment", handleUpsertAttachment as CommandHandlerFn],
    ["update_attachment", handleUpsertAttachment as CommandHandlerFn],
    ["delete_attachment", handleDeleteAttachment as CommandHandlerFn],
    ["delete_thread", handleDeleteThread as CommandHandlerFn],
    ["fork_thread", handleForkThread as CommandHandlerFn],
    ["set_search_mode", handleSetSearchMode as CommandHandlerFn],
    ["reset_storage", handleResetStorage as CommandHandlerFn],
  ]);
}

// ---------------------------------------------------------------------------
// SyncEngineDurableObject
// ---------------------------------------------------------------------------

export class SyncEngineDurableObject {
  private readonly ctx: DurableObjectState;
  private readonly env: AppEnv;
  private readonly db: DrizzleSqliteDODatabase<typeof dbSchema>;
  private readonly access: DataAccess;
  private readonly eventStore: EventStore;
  private readonly handlerRegistry: Map<SyncCommandType, CommandHandlerFn>;
  private readonly assistantTurnControllers = new Map<string, AbortController>();
  /** IDs of assistant messages whose turns are actively running in-memory.
   *  Used by the alarm handler to detect eviction — if an alarm fires for a
   *  message NOT in this set, the DO was restarted and the turn needs recovery. */
  private readonly activeTurnMessageIds = new Set<string>();

  constructor(ctx: DurableObjectState, env: AppEnv) {
    this.ctx = ctx;
    this.env = decodeAppEnv(env);
    this.db = drizzle(ctx.storage, { schema: dbSchema, logger: false });
    this.access = new DataAccess(this.db, (query: string, ...params: any[]) =>
      ctx.storage.sql.exec(query, ...params),
    );
    this.eventStore = new EventStore(this.access);
    this.handlerRegistry = buildHandlerRegistry();

    void this.ctx.blockConcurrencyWhile(async () => {
      initializeStorage(
        (query, ...params) => {
          ctx.storage.sql.exec(query, ...params);
        },
        <T extends Record<string, unknown>>(query: string, ...params: any[]) => {
          const rows = ctx.storage.sql.exec(query, ...params).toArray() as T[];
          return rows[0] ?? null;
        },
        (message) => syncLog(message),
      );
    });
  }

  // -----------------------------------------------------------------
  // DO entry points
  // -----------------------------------------------------------------

  async fetch(request: Request) {
    const url = new URL(request.url);
    syncLog("fetch", { path: url.pathname, method: request.method });

    if (url.pathname === "/ws") {
      if (!isWebSocketRequest(request)) {
        return new Response("Upgrade required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/internal/command" && request.method === "POST") {
      const jsonBody = await parseJsonRequest(request);
      if (jsonBody instanceof Response) return jsonBody;
      const body = parseInternalCommandBody(jsonBody);
      if (body instanceof Response) return body;
      syncLog("internal_command", {
        opId: body.opId,
        commandType: body.commandType,
      });
      const result = await this.processCommand(body.opId, body.commandType, body.payload, true);
      return Response.json({
        ok: true,
        ack: result.ack,
      });
    }

    if (url.pathname === "/internal/snapshot") {
      return Response.json(await this.getSnapshot());
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const envelope = parseJson<SyncClientEnvelope>(
      typeof message === "string" ? message : new TextDecoder().decode(message),
    );
    try {
      syncLog("ws_message", { type: envelope.type });
      await this.handleSocketEnvelope(ws, envelope);
    } catch (error) {
      syncLog("ws_message_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      ws.send(
        json({
          type: "sync_reset",
          reason: error instanceof Error ? error.message : String(error),
          protocolVersion: SYNC_PROTOCOL_VERSION,
          snapshot: await this.getSnapshot(),
        } satisfies SyncServerEnvelope),
      );
    }
  }

  async webSocketClose(_ws: WebSocket) {
    // When all WebSocket connections close, set an alarm to ensure recovery
    // can happen if this isolate is evicted while a turn is in flight.
    if (this.activeTurnMessageIds.size > 0) {
      syncLog("ws_close_pending_turns", {
        count: this.activeTurnMessageIds.size,
        ids: [...this.activeTurnMessageIds],
      });
      void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }

  /** DO alarm handler — fires after eviction/restart to recover interrupted turns. */
  async alarm() {
    syncLog("alarm_fired");
    const turns = this.loadAllTurnParams();
    if (turns.size === 0) {
      syncLog("alarm_no_pending_turns");
      return;
    }

    for (const [messageId, params] of turns) {
      // Turn is still live in this isolate — re-set alarm as keepalive.
      if (this.activeTurnMessageIds.has(messageId)) {
        syncLog("alarm_turn_still_active", { messageId });
        void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
        continue;
      }

      // Check if the message still needs recovery.
      const message = this.access.getMessage(messageId);
      if (!message || message.status === "completed" || message.status === "failed") {
        syncLog("alarm_cleaning_stale_turn", {
          messageId,
          status: message?.status ?? "gone",
        });
        this.clearTurnParams(messageId);
        continue;
      }

      // Message is still pending or streaming — DO was evicted mid-turn.
      syncLog("alarm_recovering_turn", {
        messageId,
        threadId: params.threadId,
        status: message.status,
      });
      await this.recoverTurn(messageId, params);
    }
  }

  // -----------------------------------------------------------------
  // WebSocket protocol
  // -----------------------------------------------------------------

  private async handleSocketEnvelope(ws: WebSocket, envelope: SyncClientEnvelope) {
    switch (envelope.type) {
      case "hello":
        await this.handleHello(ws, envelope);
        return;
      case "resume":
        await this.replayAfter(ws, envelope.lastServerSeq);
        return;
      case "ping":
        ws.send(
          json({
            type: "pong",
            at: nowIso(),
          } satisfies SyncServerEnvelope),
        );
        return;
      case "command": {
        await this.processCommand(
          envelope.opId,
          envelope.commandType,
          envelope.payload as SyncCommandPayloadMap[typeof envelope.commandType],
          true,
        );
        return;
      }
    }
  }

  private async handleHello(ws: WebSocket, hello: SyncClientHello) {
    syncLog("hello", {
      clientId: hello.clientId,
      lastServerSeq: hello.lastServerSeq,
      unackedOpIds: hello.unackedOpIds.length,
    });
    await this.ensureBootstrapped();
    const lastServerSeq = this.access.getLastServerSeq();
    ws.send(
      json({
        type: "hello_ack",
        protocolVersion: SYNC_PROTOCOL_VERSION,
        serverTime: nowIso(),
        lastServerSeq,
      } satisfies SyncServerEnvelope),
    );

    if (hello.protocolVersion !== SYNC_PROTOCOL_VERSION) {
      syncLog("sync_reset", {
        reason: "protocol_mismatch",
        clientProtocolVersion: hello.protocolVersion,
        serverProtocolVersion: SYNC_PROTOCOL_VERSION,
      });
      ws.send(
        json({
          type: "sync_reset",
          reason: "protocol_mismatch",
          protocolVersion: SYNC_PROTOCOL_VERSION,
          snapshot: await this.getSnapshot(),
        } satisfies SyncServerEnvelope),
      );
      return;
    }

    const oldestSeq = this.access.getOldestEventSeq();
    const needsFullSync =
      hello.lastServerSeq <= 0 || (oldestSeq > 0 && hello.lastServerSeq < oldestSeq);

    if (needsFullSync) {
      const reason = hello.lastServerSeq <= 0 ? "initial_sync" : "cursor_stale";
      syncLog("sync_reset", { reason, clientSeq: hello.lastServerSeq, oldestSeq });
      ws.send(
        json({
          type: "sync_reset",
          reason,
          protocolVersion: SYNC_PROTOCOL_VERSION,
          snapshot: await this.getSnapshot(),
        } satisfies SyncServerEnvelope),
      );
    } else {
      await this.replayAfter(ws, hello.lastServerSeq);
    }

    for (const opId of hello.unackedOpIds) {
      const ack = this.access.getCommandAck(opId);
      if (ack) ws.send(json(ack));
    }
  }

  private async replayAfter(ws: WebSocket, afterSeq: number) {
    for (const event of this.access.getEventsAfter(afterSeq)) {
      ws.send(json(event));
    }
  }

  private async ensureBootstrapped() {
    const existing = this.access.queryOne<{ count: number }>(
      "SELECT count(*) as count FROM workspaces",
    );
    if (Number(existing?.count ?? 0) === 0) {
      await this.processCommand(
        createId("bootstrap"),
        "bootstrap_session",
        { defaultModelId: getDefaultModelId(this.env) },
        false,
      );
      return;
    }

    if (!this.access.getAccountSettings()) {
      const { createAccountSettings } = await import("#/domain");
      const { normalizeAccountSettings } = await import("./data-access");
      const settings = createAccountSettings({ id: "default" });
      const event = await this.eventStore.appendServerEvent(null, "account_settings_upserted", {
        row: normalizeAccountSettings(settings, createId("srvop")),
      });
      this.broadcast(event);
    }
  }

  // -----------------------------------------------------------------
  // Command processing
  // -----------------------------------------------------------------

  private async processCommand<T extends SyncCommandType>(
    opId: string,
    commandType: T,
    payload: SyncCommandPayloadMap[T],
    broadcast: boolean,
  ): Promise<SyncCommandResult> {
    syncLog("process_command_start", { opId, commandType, broadcast });
    const existing = this.access.getCommandAck(opId);
    if (existing) {
      syncLog("process_command_duplicate", { opId, commandType });
      return { ack: existing, events: [] };
    }

    const handler = this.handlerRegistry.get(commandType);
    if (!handler) {
      throw new Error(`Unknown command type: ${commandType}`);
    }

    const createdAt = nowIso();
    const handlerContext = this.buildHandlerContext();

    const transactionResult = this.db.transaction(() => {
      const result = handler(opId, payload, handlerContext);

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

    if (broadcast) {
      this.broadcast(transactionResult.ack);
      for (const event of transactionResult.events) this.broadcast(event);
    }
    const followUpPromise = transactionResult.followUp?.();

    // For turn commands, persist params + alarm for eviction recovery.
    const isTurnCommand =
      commandType === "create_user_message" ||
      commandType === "retry_message" ||
      commandType === "edit_user_message";
    let turnMessageId: string | null = null;

    if (followUpPromise && isTurnCommand) {
      const p = payload as {
        threadId: string;
        userMessage?: { id: string };
        assistantMessage: { id: string };
        modelId: string;
        modelInterleavedField?: string | null;
        reasoningLevel: string;
        search: boolean;
        searchLimit?: number;
        preferFreeSearch?: boolean;
      };
      turnMessageId = p.assistantMessage.id;
      const userMessageId = p.userMessage?.id ?? "";

      this.saveTurnParams(turnMessageId, {
        messageId: turnMessageId,
        threadId: p.threadId,
        userMessageId,
        modelId: p.modelId,
        modelInterleavedField: p.modelInterleavedField ?? null,
        reasoningLevel: p.reasoningLevel,
        search: p.search,
        searchLimit: p.searchLimit ?? 5,
        preferFreeSearch: p.preferFreeSearch ?? false,
      });
      this.activeTurnMessageIds.add(turnMessageId);
      void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      syncLog("turn_params_saved", {
        messageId: turnMessageId,
        threadId: p.threadId,
      });

      followUpPromise
        .then(() => {
          this.activeTurnMessageIds.delete(turnMessageId!);
          this.clearTurnParams(turnMessageId!);
          void this.ctx.storage.deleteAlarm().catch(() => {});
          syncLog("turn_params_cleared", { messageId: turnMessageId });
        })
        .catch((error) => {
          this.activeTurnMessageIds.delete(turnMessageId!);
          syncLog("follow_up_error", {
            opId,
            commandType,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
          // Don't clear params on error — alarm handler will decide whether
          // the message is still pending and needs recovery.
        });

      this.ctx.waitUntil(followUpPromise);
    } else {
      if (followUpPromise) {
        followUpPromise.catch((error) => {
          syncLog("follow_up_error", {
            opId,
            commandType,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        });
        this.ctx.waitUntil(followUpPromise);
      }
    }

    return {
      ack: transactionResult.ack,
      events: transactionResult.events,
      followUp: followUpPromise,
    };
  }

  private buildHandlerContext(): CommandHandlerContext {
    return {
      access: this.access,
      eventStore: this.eventStore,
      env: this.env,
      assistantTurnControllers: this.assistantTurnControllers,
      runAssistantTurn: (payload: AssistantTurnPayload) =>
        runAssistantTurn(payload, {
          access: this.access,
          eventStore: this.eventStore,
          env: this.env,
          broadcast: (e) => this.broadcast(e),
          assistantTurnControllers: this.assistantTurnControllers,
        }),
      generateThreadTitle: (input: TitleGenerationPayload) =>
        generateThreadTitle(input, {
          access: this.access,
          eventStore: this.eventStore,
          env: this.env,
          broadcast: (e) => this.broadcast(e),
        }),
    };
  }

  // -----------------------------------------------------------------
  // Turn recovery — persisted params and alarm handler
  // -----------------------------------------------------------------

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
        const params = parseJson<SavedTurnParams>(row.payloadJson);
        result.set(row.messageId, params);
      } catch {
        syncLog("invalid_pending_turn", { messageId: row.messageId });
      }
    }
    return result;
  }

  /**
   * Recover a turn that was interrupted by DO eviction. Marks the stale
   * assistant message as failed, creates a new one, and restarts the turn.
   */
  private async recoverTurn(
    staleMessageId: string,
    params: SavedTurnParams,
  ): Promise<void> {
    const thread = this.access.getThread(params.threadId);
    if (!thread) {
      syncLog("recover_turn_thread_not_found", { threadId: params.threadId });
      this.clearTurnParams(staleMessageId);
      return;
    }

    const userMessage = this.access.getMessage(params.userMessageId);
    if (!userMessage) {
      syncLog("recover_turn_user_message_not_found", {
        userMessageId: params.userMessageId,
      });
      this.clearTurnParams(staleMessageId);
      return;
    }

    // Save params for the new message BEFORE making any state changes, so
    // if the DO is evicted mid-recovery, the alarm has the new params.
    const { createMessage } = await import("#/domain");
    const newAssistantMessage = createMessage({
      threadId: params.threadId,
      parentMessageId: userMessage.id,
      role: "assistant",
      modelId: params.modelId,
      reasoningLevel: params.reasoningLevel as any,
      text: "",
      searchEnabled: params.search,
      status: "pending",
    });
    const { normalizeMessage } = await import("./data-access");
    const normalized = normalizeMessage(newAssistantMessage, createId("srvop"));
    const newMessageId = normalized.id;

    // Register new params + alarm before any state mutations.
    this.saveTurnParams(newMessageId, { ...params, messageId: newMessageId });
    this.activeTurnMessageIds.add(newMessageId);
    void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);

    // Mark stale assistant message as failed due to eviction.
    const now = nowIso();
    const recoveredAt = now;
    const failEvent = this.eventStore.insertEvent(
      createId("srvop"),
      "message_failed",
      {
        messageId: staleMessageId,
        errorCode: "interrupted",
        errorMessage: "Response interrupted (DO restarted) — recovering...",
        updatedAt: recoveredAt,
      },
    );
    this.broadcast(failEvent);

    // Update thread head to point to new message.
    const threadEvent = this.eventStore.insertEvent(
      createId("srvop"),
      "thread_upserted",
      {
        row: {
          ...thread,
          headMessageId: newMessageId,
          updatedAt: recoveredAt,
          lastMessageAt: recoveredAt,
        },
      },
    );
    this.broadcast(threadEvent);

    const msgEvent = this.eventStore.insertEvent(
      createId("srvop"),
      "message_upserted",
      { row: normalized },
    );
    this.broadcast(msgEvent);

    // Now re-run the turn with the new message.
    syncLog("recover_turn_starting", {
      staleMessageId,
      newMessageId,
      threadId: params.threadId,
    });

    try {
      await this.runRecoveredTurn(
        params.threadId,
        userMessage,
        normalized,
        params,
      );
    } finally {
      this.activeTurnMessageIds.delete(newMessageId);
      const refreshed = this.access.getMessage(newMessageId);
      // Only clear params if the message reached a terminal state.
      if (
        refreshed &&
        (refreshed.status === "completed" || refreshed.status === "failed")
      ) {
        this.clearTurnParams(newMessageId);
        void this.ctx.storage.deleteAlarm().catch(() => {});
      }
    }
  }

  /**
   * Internal: run an assistant turn during recovery. Uses the same
   * runAssistantTurn function as normal turns.
   */
  private async runRecoveredTurn(
    threadId: string,
    userMessage: any,
    assistantMessage: any,
    params: SavedTurnParams,
  ) {
    const thread = this.access.getThread(threadId);
    if (!thread) return;

    await runAssistantTurn(
      {
        threadId,
        thread,
        userMessage,
        assistantMessage,
        modelId: params.modelId,
        modelInterleavedField: params.modelInterleavedField,
        reasoningLevel: params.reasoningLevel as any,
        search: params.search,
        searchLimit: params.searchLimit,
        preferFreeSearch: params.preferFreeSearch,
      },
      {
        access: this.access,
        eventStore: this.eventStore,
        env: this.env,
        broadcast: (e) => this.broadcast(e),
        assistantTurnControllers: this.assistantTurnControllers,
      },
    );
  }

  // -----------------------------------------------------------------
  // Snapshot
  // -----------------------------------------------------------------

  private async getSnapshot(): Promise<SyncSnapshot> {
    return this.access.getSnapshot();
  }

  // -----------------------------------------------------------------
  // Broadcast
  // -----------------------------------------------------------------

  private broadcast(envelope: SyncServerEnvelope) {
    const message = json(envelope);
    const sockets = this.ctx.getWebSockets();
    syncLog("broadcast", {
      type: envelope.type,
      sockets: sockets.length,
      ...(envelope.type === "event" ? { eventType: envelope.eventType } : {}),
    });
    for (const socket of sockets) {
      socket.send(message);
    }
  }
}
