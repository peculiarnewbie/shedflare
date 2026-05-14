import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { DataAccess as SyncDataAccess } from "@shedflare/sync-protocol";
import { type DataTableName } from "./sync-utils";
import {
  type SyncSnapshot,
  type AccountId,
  type TransactionId,
  type CategoryId,
  type CategoryGroupId,
  type PayeeId,
  type ScheduleId,
} from "../domain/types";

// ---------------------------------------------------------------------------
// DataAccess — bundles Drizzle + raw SQL for the sync engine
// ---------------------------------------------------------------------------

export class DataAccess {
  constructor(
    public readonly syncAccess: SyncDataAccess,
    public readonly db: DrizzleSqliteDODatabase<typeof schema>,
  ) {}

  exec(query: string, ...params: any[]) {
    return this.syncAccess.exec(query, ...params);
  }

  queryOne<T extends Record<string, unknown>>(query: string, ...params: any[]) {
    return this.syncAccess.queryOne<T>(query, ...params);
  }

  queryAll<T extends Record<string, unknown>>(query: string, ...params: any[]) {
    return this.syncAccess.queryAll<T>(query, ...params);
  }

  getLastServerSeq(): number {
    return this.syncAccess.getLastServerSeq();
  }

  getOldestEventSeq(): number {
    return this.syncAccess.getOldestEventSeq();
  }

  getEventsAfter(afterSeq: number) {
    return this.syncAccess.getEventsAfter(afterSeq);
  }

  getCommandAck(opId: string) {
    return this.syncAccess.getCommandAck(opId);
  }

  // -----------------------------------------------------------------------
  // CRUD helpers
  // -----------------------------------------------------------------------

  getAccount(id: AccountId) {
    return this.db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get() ?? null;
  }

  getTransaction(id: TransactionId) {
    return (
      this.db.select().from(schema.transactions).where(eq(schema.transactions.id, id)).get() ?? null
    );
  }

  getCategory(id: CategoryId) {
    return (
      this.db.select().from(schema.categories).where(eq(schema.categories.id, id)).get() ?? null
    );
  }

  getCategoryGroup(id: CategoryGroupId) {
    return (
      this.db.select().from(schema.categoryGroups).where(eq(schema.categoryGroups.id, id)).get() ??
      null
    );
  }

  getPayee(id: PayeeId) {
    return this.db.select().from(schema.payees).where(eq(schema.payees.id, id)).get() ?? null;
  }

  getSchedule(id: ScheduleId) {
    return this.db.select().from(schema.schedules).where(eq(schema.schedules.id, id)).get() ?? null;
  }

  getBudget(month: number, categoryId: string) {
    return (
      this.db
        .select()
        .from(schema.budgets)
        .where(eq(schema.budgets.id, `${month}-${categoryId}`))
        .get() ?? null
    );
  }

  getBudgetMonth(monthKey: string) {
    return (
      this.db
        .select()
        .from(schema.budgetMonths)
        .where(eq(schema.budgetMonths.id, monthKey))
        .get() ?? null
    );
  }

  // -----------------------------------------------------------------------
  // Snapshot — full table dump for sync_reset
  // -----------------------------------------------------------------------

  readTable<T extends Record<string, unknown>>(tableName: DataTableName): Record<string, T> {
    const rows = this.queryAll<T>(`SELECT * FROM ${tableName}`);
    const result: Record<string, T> = {};
    for (const row of rows) {
      const id = row.id as string;
      result[id] = row;
    }
    return result;
  }

  getSnapshot(): SyncSnapshot {
    return {
      serverSeq: this.getLastServerSeq(),
      tables: {
        accounts: this.readTable<schema.Account>("accounts"),
        categories: this.readTable<schema.Category>("categories"),
        category_groups: this.readTable<schema.CategoryGroup>("category_groups"),
        transactions: this.readTable<schema.Transaction>("transactions"),
        budgets: this.readTable<schema.Budget>("budgets"),
        budget_months: this.readTable<schema.BudgetMonth>("budget_months"),
        payees: this.readTable<schema.Payee>("payees"),
        schedules: this.readTable<schema.Schedule>("schedules"),
        rules: this.readTable<schema.Rule>("rules"),
        tags: this.readTable<schema.Tag>("tags"),
        transaction_tags: this.readTable<schema.TransactionTag>("transaction_tags"),
        custom_reports: this.readTable<schema.CustomReport>("custom_reports"),
        dashboard_widgets: this.readTable<schema.DashboardWidget>("dashboard_widgets"),
        exchange_rates: this.readTable<schema.ExchangeRate>("exchange_rates"),
        settings: this.readTable<schema.Setting>("settings"),
      },
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

  getCategoryGoalProgress(month: number): Array<{
    categoryId: string;
    goalType: "monthly" | "byDate";
    goalAmount: number;
    currentAmount: number;
    targetDate: string | null;
  }> {
    const now = new Date();
    const currentMonth = now.getFullYear() * 100 + (now.getMonth() + 1);

    const catRows = this.queryAll<{ id: string; goal_def: string | null }>(
      `SELECT id, goal_def FROM categories WHERE goal_def IS NOT NULL AND goal_def != '' AND hidden = 0`,
    );

    if (catRows.length === 0) return [];

    const monthToUse = month > 0 ? month : currentMonth;

    const budgetRows = this.queryAll<{ category_id: string; amount: number }>(
      `SELECT category_id, amount FROM budgets WHERE month = ?`,
      monthToUse,
    );
    const budgetMap = new Map(budgetRows.map((r) => [String(r.category_id), Number(r.amount)]));

    const spendRows = this.queryAll<{ category_id: string; total: number }>(
      `SELECT category_id, COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE category_id IS NOT NULL AND is_child = 0
       GROUP BY category_id`,
    );
    const spendMap = new Map(spendRows.map((r) => [String(r.category_id), Number(r.total)]));

    const results: Array<{
      categoryId: string;
      goalType: "monthly" | "byDate";
      goalAmount: number;
      currentAmount: number;
      targetDate: string | null;
    }> = [];

    for (const row of catRows) {
      try {
        const goal = JSON.parse(row.goal_def ?? "null") as {
          type: "monthly" | "byDate";
          amount: number;
          targetDate?: string;
        } | null;
        if (!goal || goal.amount <= 0) continue;

        const catId = String(row.id);
        if (goal.type === "monthly") {
          const budgeted = budgetMap.get(catId) ?? 0;
          results.push({
            categoryId: catId,
            goalType: "monthly",
            goalAmount: goal.amount,
            currentAmount: budgeted,
            targetDate: null,
          });
        } else if (goal.type === "byDate") {
          const totalSpent = Math.abs(spendMap.get(catId) ?? 0);
          results.push({
            categoryId: catId,
            goalType: "byDate",
            goalAmount: goal.amount,
            currentAmount: totalSpent,
            targetDate: goal.targetDate ?? null,
          });
        }
      } catch {
        // skip malformed goal_def
      }
    }

    return results;
  }
}
