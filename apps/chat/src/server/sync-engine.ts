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

  async webSocketClose(_ws: WebSocket) {}

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
    const followUpPromise = transactionResult.followUp?.().catch((error) => {
      syncLog("follow_up_error", {
        opId,
        commandType,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
    if (followUpPromise) this.ctx.waitUntil(followUpPromise);
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
