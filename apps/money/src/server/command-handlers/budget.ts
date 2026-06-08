import { eq, sql } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { computeMonthBudget } from "../budget-engine";
import { toMonthInt, nowIso, budgetId } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type BudgetCommand =
  | "set_budget_amount"
  | "set_budget_carryover"
  | "set_buffer"
  | "copy_previous_month"
  | "set_3month_avg"
  | "set_nmonth_avg"
  | "set_zero"
  | "apply_goal_templates"
  | "cover_overspending"
  | "transfer_budget"
  | "hold_for_next_month";

export async function handleBudgetCommands(
  commandType: BudgetCommand,
  payload: CommandPayloadMap[BudgetCommand],
  db: Db,
): Promise<CommandResult> {
  switch (commandType) {
    case "set_budget_amount": {
      const p = payload as CommandPayloadMap["set_budget_amount"];
      const { month, categoryId, amount } = p;
      const id = budgetId(month, categoryId);
      const now = nowIso();
      await db
        .insert(s.budgets)
        .values({ id, month, categoryId, amount, carryover: false, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: s.budgets.id,
          set: { amount, updatedAt: now },
        });
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_budget_carryover": {
      const p = payload as CommandPayloadMap["set_budget_carryover"];
      const { month, categoryId, carryover } = p;
      await db
        .update(s.budgets)
        .set({ carryover, updatedAt: nowIso() })
        .where(sql`${s.budgets.month} = ${month} AND ${s.budgets.categoryId} = ${categoryId}`);
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_buffer": {
      const p = payload as CommandPayloadMap["set_buffer"];
      const month = toMonthInt(p.month);
      const now = nowIso();
      await db
        .insert(s.budgetMonths)
        .values({ id: p.month, buffered: p.amount, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: s.budgetMonths.id,
          set: { buffered: p.amount, updatedAt: now },
        });
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "copy_previous_month": {
      const p = payload as CommandPayloadMap["copy_previous_month"];
      const monthKey = p.month;
      const month = toMonthInt(monthKey);
      const [y, m] = monthKey.split("-").map(Number);
      const prev = new Date(y, m - 2, 1);
      const prevMk = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      const prevMonth = toMonthInt(prevMk);

      const prevBudgets = await db
        .select()
        .from(s.budgets)
        .where(eq(s.budgets.month, prevMonth))
        .all();

      const now = nowIso();
      for (const pb of prevBudgets) {
        const [existing] = await db
          .select({ id: s.budgets.id })
          .from(s.budgets)
          .where(sql`${s.budgets.month} = ${month} AND ${s.budgets.categoryId} = ${pb.categoryId}`)
          .all();
        if (!existing) {
          await db.insert(s.budgets).values({
            id: budgetId(month, pb.categoryId),
            month,
            categoryId: pb.categoryId,
            amount: pb.amount,
            carryover: pb.carryover,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_3month_avg": {
      const p = payload as CommandPayloadMap["set_3month_avg"];
      const month = toMonthInt(p.month);
      const cats = await db
        .select({ id: s.categories.id })
        .from(s.categories)
        .where(eq(s.categories.hidden, false))
        .all();

      const now = nowIso();
      for (const cat of cats) {
        const amounts: number[] = [];
        for (let i = 1; i <= 3; i++) {
          let m = month - i;
          if (m % 100 === 0) m = Math.floor(m / 100 - 1) * 100 + 12;
          const [b] = await db
            .select({ amount: s.budgets.amount })
            .from(s.budgets)
            .where(sql`${s.budgets.month} = ${m} AND ${s.budgets.categoryId} = ${cat.id}`)
            .all();
          if (b) amounts.push(b.amount);
        }
        if (amounts.length > 0) {
          const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
          const id = budgetId(month, cat.id);
          await db
            .insert(s.budgets)
            .values({
              id,
              month,
              categoryId: cat.id,
              amount: avg,
              carryover: false,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: s.budgets.id,
              set: { amount: avg, updatedAt: now },
            });
        }
      }
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_nmonth_avg": {
      const p = payload as CommandPayloadMap["set_nmonth_avg"];
      const month = toMonthInt(p.month);
      const n = p.months;
      const cats = await db
        .select({ id: s.categories.id })
        .from(s.categories)
        .where(eq(s.categories.hidden, false))
        .all();

      const now = nowIso();
      for (const cat of cats) {
        const amounts: number[] = [];
        for (let i = 1; i <= n; i++) {
          let m = month - i;
          if (m % 100 === 0) m = Math.floor(m / 100 - 1) * 100 + 12;
          const [b] = await db
            .select({ amount: s.budgets.amount })
            .from(s.budgets)
            .where(sql`${s.budgets.month} = ${m} AND ${s.budgets.categoryId} = ${cat.id}`)
            .all();
          if (b) amounts.push(b.amount);
        }
        if (amounts.length > 0) {
          const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
          const id = budgetId(month, cat.id);
          await db
            .insert(s.budgets)
            .values({
              id,
              month,
              categoryId: cat.id,
              amount: avg,
              carryover: false,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: s.budgets.id,
              set: { amount: avg, updatedAt: now },
            });
        }
      }
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "set_zero": {
      const p = payload as CommandPayloadMap["set_zero"];
      const month = toMonthInt(p.month);
      await db.delete(s.budgets).where(eq(s.budgets.month, month));
      const now = nowIso();
      const cats = await db
        .select({ id: s.categories.id })
        .from(s.categories)
        .where(eq(s.categories.hidden, false))
        .all();
      for (const cat of cats) {
        const id = budgetId(month, cat.id);
        await db.insert(s.budgets).values({
          id,
          month,
          categoryId: cat.id,
          amount: 0,
          carryover: false,
          createdAt: now,
          updatedAt: now,
        });
      }
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "apply_goal_templates": {
      const p = payload as CommandPayloadMap["apply_goal_templates"];
      const month = toMonthInt(p.month);
      const cats = await db
        .select({ id: s.categories.id, goalDef: s.categories.goalDef })
        .from(s.categories)
        .where(sql`${s.categories.goalDef} IS NOT NULL AND ${s.categories.hidden} = 0`)
        .all();

      const now = nowIso();
      for (const cat of cats) {
        const goalDef = cat.goalDef ? JSON.parse(cat.goalDef) : null;
        if (!goalDef) continue;
        let amount = 0;
        if (goalDef.type === "monthly") amount = goalDef.amount ?? 0;
        else if (goalDef.type === "percentage")
          amount = goalDef.percentage ? Math.round((100000 * goalDef.percentage) / 100) : 0;
        if (amount > 0) {
          const id = budgetId(month, cat.id);
          await db
            .insert(s.budgets)
            .values({
              id,
              month,
              categoryId: cat.id,
              amount,
              carryover: false,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: s.budgets.id,
              set: { amount, updatedAt: now },
            });
        }
      }
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "cover_overspending":
    case "transfer_budget": {
      const p = payload as CommandPayloadMap["cover_overspending"];
      const month = toMonthInt(p.month);
      const now = nowIso();
      const id = budgetId(month, p.to);
      await db
        .insert(s.budgets)
        .values({
          id,
          month,
          categoryId: p.to,
          amount: p.amount,
          carryover: false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: s.budgets.id,
          set: { amount: p.amount, updatedAt: now },
        });
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    case "hold_for_next_month": {
      const p = payload as CommandPayloadMap["hold_for_next_month"];
      const month = toMonthInt(p.month);
      const now = nowIso();
      await db
        .insert(s.budgetMonths)
        .values({ id: p.month, buffered: p.amount, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: s.budgetMonths.id,
          set: { buffered: p.amount, updatedAt: now },
        });
      const result = await computeMonthBudget(db, month);
      return { ok: true, data: { month, budget: result } };
    }

    default:
      return { ok: false, error: "Unknown budget command: " + String(commandType) };
  }
}
