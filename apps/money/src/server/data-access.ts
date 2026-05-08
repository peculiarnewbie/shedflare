import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { json, sqlToBool, parseJson } from "./sync-utils";
import { nowIso, type SyncTables, type SyncSnapshot } from "../domain/types";

// ---------------------------------------------------------------------------
// DataAccess — bundles Drizzle + raw SQL for the sync engine
// ---------------------------------------------------------------------------

export class DataAccess {
  constructor(
    public readonly db: DrizzleSqliteDODatabase<typeof schema>,
    private readonly sqlExec: (query: string, ...params: any[]) => { toArray(): any[] },
  ) {}

  exec(query: string, ...params: any[]) {
    return this.sqlExec(query, ...params);
  }

  queryOne<T extends Record<string, unknown>>(query: string, ...params: any[]) {
    const rows = this.exec(query, ...params).toArray() as T[];
    return rows[0] ?? null;
  }

  queryAll<T extends Record<string, unknown>>(query: string, ...params: any[]) {
    return this.exec(query, ...params).toArray() as T[];
  }

  // -----------------------------------------------------------------------
  // Event/command tracking
  // -----------------------------------------------------------------------

  getLastServerSeq(): number {
    const row = this.queryOne<{ seq: number }>(
      "SELECT coalesce(max(seq), 0) as seq FROM events",
    );
    return Number(row?.seq ?? 0);
  }

  getOldestEventSeq(): number {
    const row = this.queryOne<{ min_seq: number | null }>(
      "SELECT MIN(seq) as min_seq FROM events",
    );
    return row?.min_seq ?? 0;
  }

  getEventsAfter(afterSeq: number) {
    return this.queryAll<{
      seq: number; event_id: string; op_id: string | null;
      type: string; payload_json: string;
    }>(
      "SELECT seq, event_id, op_id, type, payload_json FROM events WHERE seq > ? ORDER BY seq ASC",
      afterSeq,
    ).map((row) => ({
      type: "event",
      serverSeq: Number(row.seq),
      eventId: String(row.event_id),
      eventType: row.type,
      payload: parseJson(row.payload_json),
      causedByOpId: row.op_id,
    }));
  }

  getCommandAck(opId: string) {
    const row = this.db
      .select({ responseJson: schema.commands.responseJson })
      .from(schema.commands)
      .where(eq(schema.commands.opId, opId))
      .get();
    return row?.responseJson ? parseJson<import("../domain/events").SyncServerAck>(
      row.responseJson,
    ) : null;
  }

  // -----------------------------------------------------------------------
  // CRUD helpers
  // -----------------------------------------------------------------------

  getAccount(id: string) {
    return this.db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get() ?? null;
  }

  getTransaction(id: string) {
    return this.db.select().from(schema.transactions).where(eq(schema.transactions.id, id)).get() ?? null;
  }

  getCategory(id: string) {
    return this.db.select().from(schema.categories).where(eq(schema.categories.id, id)).get() ?? null;
  }

  getCategoryGroup(id: string) {
    return this.db.select().from(schema.categoryGroups).where(eq(schema.categoryGroups.id, id)).get() ?? null;
  }

  getPayee(id: string) {
    return this.db.select().from(schema.payees).where(eq(schema.payees.id, id)).get() ?? null;
  }

  getSchedule(id: string) {
    return this.db.select().from(schema.schedules).where(eq(schema.schedules.id, id)).get() ?? null;
  }

  getBudget(month: number, categoryId: string) {
    return this.db
      .select()
      .from(schema.budgets)
      .where(
        eq(schema.budgets.id, `${month}-${categoryId}`),
      )
      .get() ?? null;
  }

  getBudgetMonth(monthKey: string) {
    return this.db
      .select()
      .from(schema.budgetMonths)
      .where(eq(schema.budgetMonths.id, monthKey))
      .get() ?? null;
  }

  // -----------------------------------------------------------------------
  // Snapshot — full table dump for sync_reset
  // -----------------------------------------------------------------------

  readTable(tableName: string) {
    const rows = this.queryAll<Record<string, unknown>>(`SELECT * FROM ${tableName}`);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      const id = String(row.id ?? "");
      result[id] = row;
    }
    return result;
  }

  getSnapshot(): SyncSnapshot {
    return {
      serverSeq: this.getLastServerSeq(),
      tables: {
        accounts: this.readTable("accounts") as Record<string, unknown>,
        categories: this.readTable("categories") as Record<string, unknown>,
        category_groups: this.readTable("category_groups") as Record<string, unknown>,
        transactions: this.readTable("transactions") as Record<string, unknown>,
        budgets: this.readTable("budgets") as Record<string, unknown>,
        budget_months: this.readTable("budget_months") as Record<string, unknown>,
        payees: this.readTable("payees") as Record<string, unknown>,
        schedules: this.readTable("schedules") as Record<string, unknown>,
        rules: this.readTable("rules") as Record<string, unknown>,
        tags: this.readTable("tags") as Record<string, unknown>,
        transaction_tags: this.readTable("transaction_tags") as Record<string, unknown>,
        custom_reports: this.readTable("custom_reports") as Record<string, unknown>,
        dashboard_widgets: this.readTable("dashboard_widgets") as Record<string, unknown>,
        exchange_rates: this.readTable("exchange_rates") as Record<string, unknown>,
      } as SyncTables,
    };
  }

  // -----------------------------------------------------------------------
  // Monetary aggregates for budget computation
  // -----------------------------------------------------------------------

  getIncomeTotal(startDate: string, endDate: string): number {
    const row = this.queryOne<{ total: number | null }>(
      `SELECT COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ? AND c.is_income = 1 AND c.hidden = 0`,
      startDate,
      endDate,
    );
    return Number(row?.total ?? 0);
  }

  getCategorySpending(month: number): Array<{ categoryId: string; spent: number }> {
    const startDate = `${Math.floor(month / 100)}-${String(month % 100).padStart(2, "0")}-01`;
    const endDateObj = new Date(Math.floor(month / 100), month % 100, 0);
    const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;

    return this.queryAll<{ category_id: string; total: number }>(
      `SELECT category_id, COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE date >= ? AND date < ? AND category_id IS NOT NULL AND is_child = 0
       GROUP BY category_id`,
      startDate,
      endDate,
    ).map((r) => ({ categoryId: String(r.category_id), spent: Number(r.total) }));
  }

  getTotalBudgeted(month: number): number {
    const row = this.queryOne<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM budgets WHERE month = ?`,
      month,
    );
    return Number(row?.total ?? 0);
  }
}
