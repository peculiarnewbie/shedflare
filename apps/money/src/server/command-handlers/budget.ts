/**
 * Budget command handlers — direct D1 SQL to avoid Drizzle 1.0 API issues.
 */
import type { DataAccess } from "../data-access";
import { computeMonthBudget } from "../budget-engine";
import { toMonthInt } from "../../domain/types";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export function handleBudgetCommands(
  commandType: string,
  payload: any,
  access: DataAccess,
): CommandResult {
  switch (commandType) {
    case "set_budget_amount": {
      const { month, categoryId, amount } = payload;
      const id = `${month}-${categoryId}`;
      const now = new Date().toISOString();
      access.exec(
        `INSERT OR REPLACE INTO budgets (id, month, category_id, amount, carryover, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)`,
        id,
        month,
        categoryId,
        amount,
        now,
        now,
      );
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_budget_carryover": {
      const { month, categoryId, carryover } = payload;
      const now = new Date().toISOString();
      access.exec(
        `UPDATE budgets SET carryover = ?, updated_at = ? WHERE month = ? AND category_id = ?`,
        carryover ? 1 : 0,
        now,
        month,
        categoryId,
      );
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_buffer": {
      const month = toMonthInt(payload.month);
      const now = new Date().toISOString();
      access.exec(
        `INSERT OR REPLACE INTO budget_months (id, buffered, created_at, updated_at)
        VALUES (?, ?, ?, ?)`,
        payload.month,
        payload.amount,
        now,
        now,
      );
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "copy_previous_month": {
      const monthKey = payload.month;
      const month = toMonthInt(monthKey);
      const [y, m] = monthKey.split("-").map(Number);
      const prev = new Date(y, m - 2, 1);
      const prevMk = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      const prevMonth = toMonthInt(prevMk);
      const prevBudgets = access.queryAll<{
        category_id: string;
        amount: number;
        carryover: number | null;
      }>("SELECT * FROM budgets WHERE month = ?", prevMonth);
      const now = new Date().toISOString();
      for (const pb of prevBudgets) {
        const existing = access.queryOne(
          "SELECT 1 FROM budgets WHERE month = ? AND category_id = ?",
          month,
          pb.category_id,
        );
        if (!existing) {
          access.exec(
            `INSERT INTO budgets (id, month, category_id, amount, carryover, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            `${month}-${pb.category_id}`,
            month,
            pb.category_id,
            pb.amount,
            pb.carryover ?? 0,
            now,
            now,
          );
        }
      }
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_3month_avg": {
      const month = toMonthInt(payload.month);
      const cats = access.queryAll<{ id: string }>("SELECT id FROM categories WHERE hidden = 0");
      const now = new Date().toISOString();
      for (const cat of cats) {
        const amounts: number[] = [];
        for (let i = 1; i <= 3; i++) {
          let m = month - i;
          if (m % 100 === 0) m = Math.floor(m / 100 - 1) * 100 + 12;
          const b = access.queryOne<{ amount: number }>(
            "SELECT amount FROM budgets WHERE month = ? AND category_id = ?",
            m,
            cat.id,
          );
          if (b?.amount != null) amounts.push(b.amount);
        }
        if (amounts.length > 0) {
          const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
          const id = `${month}-${cat.id}`;
          access.exec(
            `INSERT OR REPLACE INTO budgets (id, month, category_id, amount, carryover, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?)`,
            id,
            month,
            cat.id,
            avg,
            now,
            now,
          );
        }
      }
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_nmonth_avg": {
      const month = toMonthInt(payload.month);
      const n = payload.months;
      const cats = access.queryAll<{ id: string }>("SELECT id FROM categories WHERE hidden = 0");
      const now = new Date().toISOString();
      for (const cat of cats) {
        const amounts: number[] = [];
        for (let i = 1; i <= n; i++) {
          let m = month - i;
          if (m % 100 === 0) m = Math.floor(m / 100 - 1) * 100 + 12;
          const b = access.queryOne<{ amount: number }>(
            "SELECT amount FROM budgets WHERE month = ? AND category_id = ?",
            m,
            cat.id,
          );
          if (b?.amount != null) amounts.push(b.amount);
        }
        if (amounts.length > 0) {
          const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
          const id = `${month}-${cat.id}`;
          access.exec(
            `INSERT OR REPLACE INTO budgets (id, month, category_id, amount, carryover, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?)`,
            id,
            month,
            cat.id,
            avg,
            now,
            now,
          );
        }
      }
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_zero": {
      const month = toMonthInt(payload.month);
      access.exec("DELETE FROM budgets WHERE month = ?", month);
      const now = new Date().toISOString();
      const cats = access.queryAll<{ id: string }>("SELECT id FROM categories WHERE hidden = 0");
      for (const cat of cats) {
        const id = `${month}-${cat.id}`;
        access.exec(
          `INSERT OR REPLACE INTO budgets (id, month, category_id, amount, carryover, created_at, updated_at)
          VALUES (?, ?, ?, 0, 0, ?, ?)`,
          id,
          month,
          cat.id,
          now,
          now,
        );
      }
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "apply_goal_templates": {
      const month = toMonthInt(payload.month);
      const cats = access.queryAll<{ id: string; goal_def: string | null }>(
        "SELECT id, goal_def FROM categories WHERE goal_def IS NOT NULL AND hidden = 0",
      );
      const now = new Date().toISOString();
      for (const cat of cats) {
        const goalDef = cat.goal_def ? JSON.parse(cat.goal_def) : null;
        if (!goalDef) continue;
        let amount = 0;
        if (goalDef.type === "monthly") amount = goalDef.amount ?? 0;
        else if (goalDef.type === "percentage")
          amount = goalDef.percentage ? Math.round((100000 * goalDef.percentage) / 100) : 0;
        if (amount > 0) {
          const id = `${month}-${cat.id}`;
          access.exec(
            `INSERT OR REPLACE INTO budgets (id, month, category_id, amount, carryover, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, ?, ?)`,
            id,
            month,
            cat.id,
            amount,
            now,
            now,
          );
        }
      }
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "cover_overspending":
    case "transfer_budget": {
      const month = toMonthInt(payload.month);
      const now = new Date().toISOString();
      access.exec(
        `INSERT OR REPLACE INTO budgets (id, month, category_id, amount, carryover, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)`,
        `${month}-${payload.to}`,
        month,
        payload.to,
        payload.amount,
        now,
        now,
      );
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "hold_for_next_month": {
      const month = toMonthInt(payload.month);
      const now = new Date().toISOString();
      access.exec(
        `INSERT OR REPLACE INTO budget_months (id, buffered, created_at, updated_at)
        VALUES (?, ?, ?, ?)`,
        payload.month,
        payload.amount,
        now,
        now,
      );
      const result = computeMonthBudget(access, month);
      return { ok: true, data: { month, budget: result } };
    }

    default:
      return { ok: false, error: `Unknown budget command: ${commandType}` };
  }
}
