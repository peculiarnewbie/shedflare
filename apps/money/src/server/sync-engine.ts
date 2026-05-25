import { SYNC_PROTOCOL_VERSION } from "../domain/types";
import { startSpanWithStack, endSpanWithStack } from "./tracer";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import * as dbSchema from "../db/schema";
import { SyncEngineDO, HandlerRegistry, type HandlerContext } from "@shedflare/sync-protocol";
import { syncLog, syncLogError } from "./sync-utils";
import { initializeStorage } from "./schema";
import { DataAccess } from "./data-access";
import { EventStore } from "./event-store";
import { handleAccountCommands } from "./command-handlers/accounts";
import { handleTransactionCommands } from "./command-handlers/transactions";
import { handleCategoryCommands } from "./command-handlers/categories";
import { handleBudgetCommands } from "./command-handlers/budget";
import { handlePayeeCommands } from "./command-handlers/payees";
import { handleScheduleCommands } from "./command-handlers/schedules";
import { handleRuleCommands } from "./command-handlers/rules";
import { handleTagCommands } from "./command-handlers/tags";
import { handleImportCommands } from "./command-handlers/import";
import { handleFilterCommands } from "./command-handlers/filters";
import { handleReportCommands } from "./command-handlers/reports";
import { handleSettingCommands } from "./command-handlers/settings";
import { handleNotesCommands } from "./command-handlers/notes";
import { handleApiRequest } from "./api-handlers";

type Env = {
  UPLOADS: R2Bucket;
};

type MoneyHandlerFn = (
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
) => { events: any[] };

// ---------------------------------------------------------------------------
// MoneyBudgetDO
// ---------------------------------------------------------------------------

export class MoneyBudgetDO extends SyncEngineDO<Env> {
  private readonly db: DrizzleSqliteDODatabase<typeof dbSchema>;
  private readonly moneyAccess: DataAccess;
  private readonly eventStore: EventStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema: dbSchema, logger: false });
    this.moneyAccess = new DataAccess(this.access, this.db);
    this.eventStore = new EventStore(this.moneyAccess);
    this.registerHandlers(this.handlerRegistry);

    void ctx.blockConcurrencyWhile(async () => {
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

  get protocolVersion(): string {
    return SYNC_PROTOCOL_VERSION;
  }

  registerHandlers(registry: HandlerRegistry<HandlerContext<Env>>): void {
    const adapt = (handler: MoneyHandlerFn) => {
      return (opId: string, payload: any, _ctx: HandlerContext<Env>) => {
        const commandPayload =
          payload && typeof payload === "object"
            ? {
                ...(payload as Record<string, unknown>),
                commandType: payload.commandType ?? payload.type,
              }
            : payload;
        return handler(opId, commandPayload, this.moneyAccess, this.eventStore);
      };
    };

    const entries: [string, MoneyHandlerFn][] = [
      ["create_account", handleAccountCommands],
      ["update_account", handleAccountCommands],
      ["delete_account", handleAccountCommands],
      ["close_account", handleAccountCommands],
      ["reopen_account", handleAccountCommands],
      ["reorder_accounts", handleAccountCommands],
      ["create_transaction", handleTransactionCommands],
      ["update_transaction", handleTransactionCommands],
      ["delete_transaction", handleTransactionCommands],
      ["split_transaction", handleTransactionCommands],
      ["create_category", handleCategoryCommands],
      ["update_category", handleCategoryCommands],
      ["delete_category", handleCategoryCommands],
      ["create_category_group", handleCategoryCommands],
      ["update_category_group", handleCategoryCommands],
      ["delete_category_group", handleCategoryCommands],
      ["reorder_categories", handleCategoryCommands],
      ["set_budget_amount", handleBudgetCommands],
      ["set_budget_carryover", handleBudgetCommands],
      ["set_buffer", handleBudgetCommands],
      ["copy_previous_month", handleBudgetCommands],
      ["set_3month_avg", handleBudgetCommands],
      ["set_nmonth_avg", handleBudgetCommands],
      ["set_zero", handleBudgetCommands],
      ["apply_goal_templates", handleBudgetCommands],
      ["cover_overspending", handleBudgetCommands],
      ["transfer_budget", handleBudgetCommands],
      ["hold_for_next_month", handleBudgetCommands],
      ["create_payee", handlePayeeCommands],
      ["update_payee", handlePayeeCommands],
      ["merge_payees", handlePayeeCommands],
      ["create_schedule", handleScheduleCommands],
      ["update_schedule", handleScheduleCommands],
      ["delete_schedule", handleScheduleCommands],
      ["skip_schedule_date", handleScheduleCommands],
      ["post_schedule_transaction", handleScheduleCommands],
      ["create_rule", handleRuleCommands],
      ["update_rule", handleRuleCommands],
      ["delete_rule", handleRuleCommands],
      ["create_tag", handleTagCommands],
      ["delete_tag", handleTagCommands],
      ["add_transaction_tag", handleTagCommands],
      ["remove_transaction_tag", handleTagCommands],
      ["import_transactions", handleImportCommands],
      ["create_filter", handleFilterCommands],
      ["update_filter", handleFilterCommands],
      ["delete_filter", handleFilterCommands],
      ["create_report", handleReportCommands],
      ["update_report", handleReportCommands],
      ["delete_report", handleReportCommands],
      ["update_dashboard", handleReportCommands],
      ["update_exchange_rate", handleAccountCommands],
      ["update_setting", handleSettingCommands],
      ["create_note", handleNotesCommands],
      ["update_note", handleNotesCommands],
      ["delete_note", handleNotesCommands],
      ["list_notes", handleNotesCommands],
    ];

    for (const [type, handler] of entries) {
      registry.set(type, adapt(handler));
    }
  }

  getSnapshot() {
    return this.moneyAccess.getSnapshot();
  }

  protected executeTransaction<T>(fn: () => T): T {
    return (this.db as any).transaction(fn);
  }

  // ─── Fetch ──────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    syncLog("fetch", { path: url.pathname, method: request.method });

    // WebSocket upgrade — supports both /ws and /api/sync/ws
    if (url.pathname === "/ws" || url.pathname === "/api/sync/ws") {
      return super.fetch(new Request(new URL("/ws", url.origin).toString(), request));
    }

    // Everything else goes through base class routing
    return super.fetch(request);
  }

  // ─── API routes ─────────────────────────────────────────────────

  protected handleApiRequest(request: Request): Promise<Response> | Response {
    const url = new URL(request.url);
    const apiPath = url.pathname.startsWith("/api/") ? url.pathname : null;
    if (apiPath) {
      const apiResponse = handleApiRequest(url, request.method, this.moneyAccess);
      if (apiResponse) return apiResponse;
    }
    return super.handleApiRequest(request);
  }

  // ─── WebSocket ──────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const spanId = startSpanWithStack("webSocketMessage");
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let envelope: any;
    try {
      envelope = JSON.parse(text);
    } catch {
      syncLogError("ws_parse_error", text);
      endSpanWithStack(spanId, { status: "parse_error" });
      return;
    }

    try {
      syncLog("ws_message", { type: envelope.type });
      await super.webSocketMessage(ws, text);
      endSpanWithStack(spanId, { type: envelope.type });
    } catch (error) {
      syncLogError("ws_message_error", error);
      endSpanWithStack(spanId, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  async webSocketClose(_ws: WebSocket) {
    syncLog("ws_close");
  }

  // ─── Hello ──────────────────────────────────────────────────────

  protected async handleHello(ws: WebSocket, hello: any): Promise<void> {
    const spanId = startSpanWithStack("handleHello", {
      clientId: hello.clientId,
      lastServerSeq: hello.lastServerSeq,
    });
    syncLog("hello", {
      clientId: hello.clientId,
      lastServerSeq: hello.lastServerSeq,
      unackedOpIds: hello.unackedOpIds?.length,
    });
    await super.handleHello(ws, hello);
    endSpanWithStack(spanId, { status: "ok" });
  }
}
