/**
 * MoneyBudgetDO — Durable Object for the budget app.
 *
 * Handles WebSocket connections, processes commands, stores events,
 * and broadcasts state changes to all connected clients.
 */
import { SYNC_PROTOCOL_VERSION, createId, nowIso } from "../domain/types";
import { startSpanWithStack, endSpanWithStack, traceAsync } from "./tracer";
import type {
  SyncEventPayloadMap,
  SyncEventType,
  SyncServerEnvelope,
  SyncServerAck,
  SyncServerEvent,
  SyncClientEnvelope,
  SyncClientHello,
} from "../domain/events";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import * as dbSchema from "../db/schema";
import { json, parseJson, isWebSocketRequest, syncLog, syncLogError } from "./sync-utils";
import { initializeStorage } from "./schema";
import { DataAccess } from "./data-access";
import { EventStore } from "./event-store";
import { computeMonthBudget } from "./budget-engine";
import { handleAccountCommands } from "./command-handlers/accounts";
import { handleTransactionCommands } from "./command-handlers/transactions";
import { handleCategoryCommands } from "./command-handlers/categories";
import { handleBudgetCommands } from "./command-handlers/budget";
import { handlePayeeCommands } from "./command-handlers/payees";
import { handleScheduleCommands } from "./command-handlers/schedules";
import { handleRuleCommands } from "./command-handlers/rules";
import { handleTagCommands } from "./command-handlers/tags";
import { handleImportCommands } from "./command-handlers/import";
import { handleReportCommands } from "./command-handlers/reports";
import { handleSettingCommands } from "./command-handlers/settings";
import { handleApiRequest } from "./api-handlers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommandHandlerFn = (
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
) => { events: SyncServerEvent[]; followUp?: () => Promise<void> };

// ---------------------------------------------------------------------------
// Command handler registry
// ---------------------------------------------------------------------------

function buildHandlerRegistry(): Map<string, CommandHandlerFn> {
  return new Map<string, CommandHandlerFn>([
    // Accounts
    ["create_account", handleAccountCommands as CommandHandlerFn],
    ["update_account", handleAccountCommands as CommandHandlerFn],
    ["delete_account", handleAccountCommands as CommandHandlerFn],
    ["close_account", handleAccountCommands as CommandHandlerFn],
    ["reopen_account", handleAccountCommands as CommandHandlerFn],
    ["reorder_accounts", handleAccountCommands as CommandHandlerFn],
    // Transactions
    ["create_transaction", handleTransactionCommands as CommandHandlerFn],
    ["update_transaction", handleTransactionCommands as CommandHandlerFn],
    ["delete_transaction", handleTransactionCommands as CommandHandlerFn],
    ["split_transaction", handleTransactionCommands as CommandHandlerFn],
    // Categories
    ["create_category", handleCategoryCommands as CommandHandlerFn],
    ["update_category", handleCategoryCommands as CommandHandlerFn],
    ["delete_category", handleCategoryCommands as CommandHandlerFn],
    ["create_category_group", handleCategoryCommands as CommandHandlerFn],
    ["update_category_group", handleCategoryCommands as CommandHandlerFn],
    ["delete_category_group", handleCategoryCommands as CommandHandlerFn],
    ["reorder_categories", handleCategoryCommands as CommandHandlerFn],
    // Budget
    ["set_budget_amount", handleBudgetCommands as CommandHandlerFn],
    ["set_budget_carryover", handleBudgetCommands as CommandHandlerFn],
    ["set_buffer", handleBudgetCommands as CommandHandlerFn],
    ["copy_previous_month", handleBudgetCommands as CommandHandlerFn],
    ["set_3month_avg", handleBudgetCommands as CommandHandlerFn],
    ["set_nmonth_avg", handleBudgetCommands as CommandHandlerFn],
    ["set_zero", handleBudgetCommands as CommandHandlerFn],
    ["apply_goal_templates", handleBudgetCommands as CommandHandlerFn],
    ["cover_overspending", handleBudgetCommands as CommandHandlerFn],
    ["transfer_budget", handleBudgetCommands as CommandHandlerFn],
    ["hold_for_next_month", handleBudgetCommands as CommandHandlerFn],
    // Payees
    ["create_payee", handlePayeeCommands as CommandHandlerFn],
    ["update_payee", handlePayeeCommands as CommandHandlerFn],
    ["merge_payees", handlePayeeCommands as CommandHandlerFn],
    // Schedules
    ["create_schedule", handleScheduleCommands as CommandHandlerFn],
    ["update_schedule", handleScheduleCommands as CommandHandlerFn],
    ["delete_schedule", handleScheduleCommands as CommandHandlerFn],
    ["skip_schedule_date", handleScheduleCommands as CommandHandlerFn],
    ["post_schedule_transaction", handleScheduleCommands as CommandHandlerFn],
    // Rules
    ["create_rule", handleRuleCommands as CommandHandlerFn],
    ["update_rule", handleRuleCommands as CommandHandlerFn],
    ["delete_rule", handleRuleCommands as CommandHandlerFn],
    // Tags
    ["create_tag", handleTagCommands as CommandHandlerFn],
    ["delete_tag", handleTagCommands as CommandHandlerFn],
    ["add_transaction_tag", handleTagCommands as CommandHandlerFn],
    ["remove_transaction_tag", handleTagCommands as CommandHandlerFn],
    // Import
    ["import_transactions", handleImportCommands as CommandHandlerFn],
    // Reports
    ["create_report", handleReportCommands as CommandHandlerFn],
    ["update_report", handleReportCommands as CommandHandlerFn],
    ["delete_report", handleReportCommands as CommandHandlerFn],
    // Dashboard
    ["update_dashboard", handleReportCommands as CommandHandlerFn],
    // Exchange rates
    ["update_exchange_rate", handleAccountCommands as CommandHandlerFn],
    ["update_setting", handleSettingCommands as CommandHandlerFn],
  ]);
}

// ---------------------------------------------------------------------------
// MoneyBudgetDO
// ---------------------------------------------------------------------------

// Make env type for our DO
type Env = {
  UPLOADS: R2Bucket;
};

export class MoneyBudgetDO implements DurableObject {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;
  private readonly db: DrizzleSqliteDODatabase<typeof dbSchema>;
  private readonly access: DataAccess;
  private readonly eventStore: EventStore;
  private readonly handlerRegistry: Map<string, CommandHandlerFn>;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.db = drizzle(ctx.storage, { schema: dbSchema, logger: false });
    this.access = new DataAccess(this.db, (query: string, ...params: any[]) =>
      ctx.storage.sql.exec(query, ...params),
    );
    this.eventStore = new EventStore(this.access);
    this.handlerRegistry = buildHandlerRegistry();

    // Initialize schema on first boot
    void this.ctx.blockConcurrencyWhile(async () => {
      initializeStorage(
        (query: string, ...params: any[]) => {
          ctx.storage.sql.exec(query, ...params);
        },
        (query: string, ...params: any[]) => {
          const rows = ctx.storage.sql.exec(query, ...params).toArray() as Record<
            string,
            unknown
          >[];
          return (rows[0] ?? null) as any;
        },
        (message: string) => syncLog(message),
      );
    });
  }

  // -----------------------------------------------------------------
  // Fetch handler — WebSocket upgrade or HTTP commands
  // -----------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    syncLog("fetch", { path: url.pathname, method: request.method });

    // WebSocket upgrade
    if (url.pathname === "/ws" || url.pathname === "/api/sync/ws") {
      if (!isWebSocketRequest(request)) {
        return new Response("Upgrade required", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // Internal command endpoint (for import file processing)
    if (url.pathname === "/internal/command" && request.method === "POST") {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body.opId !== "string" || typeof body.commandType !== "string") {
        return new Response("Invalid command body", { status: 400 });
      }
      const result = await this.processCommand(
        body.opId as string,
        body.commandType as string,
        body.payload,
        true,
      );
      return Response.json({ ok: true, ack: result.ack });
    }

    // Snapshot endpoint (for debugging/admin)
    if (url.pathname === "/internal/snapshot") {
      return Response.json(this.access.getSnapshot());
    }

    // REST API handlers (for initial data loading before sync connects)
    const apiPath = url.pathname.startsWith("/api/") ? url.pathname : null;
    if (apiPath) {
      const apiResponse = handleApiRequest(apiPath, request.method, this.access);
      if (apiResponse) return apiResponse;
    }

    return new Response("Not found", { status: 404 });
  }

  // -----------------------------------------------------------------
  // WebSocket message handling
  // -----------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const spanId = startSpanWithStack("webSocketMessage");
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let envelope: SyncClientEnvelope;
    try {
      envelope = JSON.parse(text) as SyncClientEnvelope;
    } catch {
      syncLogError("ws_parse_error", text);
      endSpanWithStack(spanId, { status: "parse_error" });
      return;
    }

    try {
      syncLog("ws_message", { type: envelope.type });

      switch (envelope.type) {
        case "hello":
          await this.handleHello(ws, envelope);
          break;
        case "ping":
          ws.send(json({ type: "pong", at: nowIso() } satisfies SyncServerEnvelope));
          break;
        case "command":
          await this.processCommand(envelope.opId, envelope.commandType, envelope.payload, true);
          break;
        default:
          syncLogError("ws_unknown_envelope", envelope);
      }
      endSpanWithStack(spanId, { type: envelope.type });
    } catch (error) {
      syncLogError("ws_message_error", error);
      endSpanWithStack(spanId, { error: error instanceof Error ? error.message : String(error) });
      ws.send(
        json({
          type: "sync_reset",
          reason: error instanceof Error ? error.message : "Unknown error",
          protocolVersion: SYNC_PROTOCOL_VERSION,
          snapshot: this.access.getSnapshot(),
        } satisfies SyncServerEnvelope),
      );
    }
  }

  async webSocketClose(_ws: WebSocket) {
    syncLog("ws_close");
  }

  // -----------------------------------------------------------------
  // Hello handshake
  // -----------------------------------------------------------------

  private async handleHello(ws: WebSocket, hello: SyncClientHello) {
    const spanId = startSpanWithStack("handleHello", {
      clientId: hello.clientId,
      lastServerSeq: hello.lastServerSeq,
    });
    syncLog("hello", {
      clientId: hello.clientId,
      lastServerSeq: hello.lastServerSeq,
      unackedOpIds: hello.unackedOpIds.length,
    });

    const lastServerSeq = this.access.getLastServerSeq();
    ws.send(
      json({
        type: "hello_ack",
        protocolVersion: SYNC_PROTOCOL_VERSION,
        serverTime: nowIso(),
        lastServerSeq,
      } satisfies SyncServerEnvelope),
    );

    // Protocol mismatch → full reset
    if (hello.protocolVersion !== SYNC_PROTOCOL_VERSION) {
      syncLog("sync_reset", { reason: "protocol_mismatch" });
      ws.send(
        json({
          type: "sync_reset",
          reason: "protocol_mismatch",
          protocolVersion: SYNC_PROTOCOL_VERSION,
          snapshot: this.access.getSnapshot(),
        } satisfies SyncServerEnvelope),
      );
      endSpanWithStack(spanId, { status: "protocol_mismatch" });
      return;
    }

    // Stale cursor or first sync → full snapshot
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
          snapshot: this.access.getSnapshot(),
        } satisfies SyncServerEnvelope),
      );
    } else {
      // Replay events since last known seq
      const events = this.access.getEventsAfter(hello.lastServerSeq);
      for (const event of events) {
        ws.send(json(event));
      }
      syncLog("replayed_events", { count: events.length, after: hello.lastServerSeq });
    }

    // Re-process unacked ops
    for (const opId of hello.unackedOpIds) {
      const ack = this.access.getCommandAck(opId);
      if (ack) ws.send(json(ack));
    }
    endSpanWithStack(spanId, { status: "ok", needsFullSync });
  }

  // -----------------------------------------------------------------
  // Command processing
  // -----------------------------------------------------------------

  private async processCommand(
    opId: string,
    commandType: string,
    payload: unknown,
    broadcast: boolean,
  ): Promise<{ ack: SyncServerAck | null; events: SyncServerEvent[] }> {
    const spanId = startSpanWithStack("processCommand", { opId, commandType, broadcast });
    syncLog("process_command_start", { opId, commandType, broadcast });

    try {
      const existing = this.access.getCommandAck(opId);
      if (existing) {
        syncLog("process_command_duplicate", { opId, commandType });
        endSpanWithStack(spanId, { status: "duplicate" });
        return { ack: existing, events: [] };
      }

      const handler = this.handlerRegistry.get(commandType);
      if (!handler) {
        throw new Error(`Unknown command type: ${commandType}`);
      }

      const createdAt = nowIso();

      const result = this.db.transaction(() => {
        const commandPayload =
          payload && typeof payload === "object"
            ? { ...(payload as Record<string, unknown>), commandType }
            : payload;
        const { events: resultEvents } = handler(
          opId,
          commandPayload,
          this.access,
          this.eventStore,
        );

        const ackedSeq =
          resultEvents.length > 0
            ? resultEvents[resultEvents.length - 1]!.serverSeq
            : this.access.getLastServerSeq();

        const ack = {
          type: "ack" as const,
          opId,
          serverSeq: ackedSeq,
          acceptedAt: createdAt,
          commandType,
        } satisfies SyncServerAck;

        const ackJson = json(ack);
        this.access.exec(
          `INSERT OR REPLACE INTO commands (op_id, type, status, response_json, acked_seq, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          opId,
          commandType,
          "accepted",
          ackJson,
          ackedSeq,
          createdAt,
        );

        return { ack, events: resultEvents };
      });

      syncLog("process_command_committed", {
        opId,
        commandType,
        eventCount: result.events.length,
        ackedSeq: result.ack.serverSeq,
      });

      if (broadcast) {
        this.broadcast(result.ack);
        for (const event of result.events) {
          this.broadcast(event);
        }
      }

      endSpanWithStack(spanId, {
        eventCount: result.events.length,
        ackedSeq: result.ack.serverSeq,
      });
      return { ack: result.ack, events: result.events };
    } catch (error) {
      endSpanWithStack(spanId, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  // -----------------------------------------------------------------
  // Broadcast to all connected WebSocket clients
  // -----------------------------------------------------------------

  private broadcast(envelope: SyncServerEnvelope) {
    const message = json(envelope);
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      try {
        socket.send(message);
      } catch {
        // Socket may have closed; ignore
      }
    }
  }
}
