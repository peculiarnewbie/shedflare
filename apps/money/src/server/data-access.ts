import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";

// ---------------------------------------------------------------------------
// DataAccess — D1-backed data access for command handlers and API endpoints.
// Uses raw D1 SQL for queries (Drizzle 1.0 returns Promises for .get/.all).
// Uses Drizzle for typed insert/update/delete only (via .run()).
// ---------------------------------------------------------------------------

export class DataAccess {
  public readonly db: D1Database;
  public readonly drizzle: DrizzleD1Database<typeof schema>;

  constructor(d1: D1Database, drizzle: DrizzleD1Database<typeof schema>) {
    this.db = d1;
    this.drizzle = drizzle;
  }

  // -----------------------------------------------------------------------
  // Raw SQL helpers — synchronous D1 operations
  // -----------------------------------------------------------------------

  exec(query: string, ...params: unknown[]): D1Result {
    return (this.db.prepare(query).bind(...params) as any).run();
  }

  queryOne<T extends Record<string, unknown>>(query: string, ...params: unknown[]): T | null {
    return (this.db.prepare(query).bind(...params) as any).first() as T | null;
  }

  queryAll<T extends Record<string, unknown>>(query: string, ...params: unknown[]): T[] {
    return (this.db.prepare(query).bind(...params) as any).all().results as T[];
  }

  // -----------------------------------------------------------------------
  // CRUD helpers — raw SQL for synchronous access
  // -----------------------------------------------------------------------

  getAccount(id: string) {
    return this.queryOne<Record<string, unknown>>("SELECT * FROM accounts WHERE id = ?", id);
  }

  getTransaction(id: string) {
    return this.queryOne<Record<string, unknown>>("SELECT * FROM transactions WHERE id = ?", id);
  }

  getCategory(id: string) {
    return this.queryOne<Record<string, unknown>>("SELECT * FROM categories WHERE id = ?", id);
  }

  getCategoryGroup(id: string) {
    return this.queryOne<Record<string, unknown>>("SELECT * FROM category_groups WHERE id = ?", id);
  }

  getPayee(id: string) {
    return this.queryOne<Record<string, unknown>>("SELECT * FROM payees WHERE id = ?", id);
  }

  getSchedule(id: string) {
    return this.queryOne<Record<string, unknown>>("SELECT * FROM schedules WHERE id = ?", id);
  }

  getBudget(month: number, categoryId: string) {
    return this.queryOne<Record<string, unknown>>(
      "SELECT * FROM budgets WHERE id = ?",
      `${month}-${categoryId}`,
    );
  }

  getBudgetMonth(monthKey: string) {
    return this.queryOne<Record<string, unknown>>(
      "SELECT * FROM budget_months WHERE id = ?",
      monthKey,
    );
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

  getCategoryGoalProgress(_month: number): Array<any> {
    // Simplified: return empty, goal tracking is a low-priority feature
    return [];
  }
}
