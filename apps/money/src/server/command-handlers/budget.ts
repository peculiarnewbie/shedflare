/**
 * Budget command handlers — set amounts, carryover, buffer, copy, average,
 * goal templates, cover overspending, transfer, hold.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createBudget, createBudgetMonth } from "../../domain/factories";
import { computeMonthBudget } from "../budget-engine";
import { toMonthInt, prevMonthKey, fromMonthInt } from "../../domain/types";

export function handleBudgetCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "set_budget_amount") {
    case "set_budget_amount": {
      const month = payload.month;
      const categoryId = payload.categoryId;
      const existing = access.getBudget(month, categoryId);

      if (existing) {
        const updated = {
          ...existing,
          amount: payload.amount,
          updatedAt: new Date().toISOString(),
        };
        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId,
          amount: payload.amount,
          carryover: existing.carryover,
        }) as SyncServerEvent);
      } else {
        const row = createBudget({ month, categoryId, amount: payload.amount });
        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId,
          amount: payload.amount,
          carryover: row.carryover,
        }) as SyncServerEvent);
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_budget_carryover": {
      const month = payload.month;
      const categoryId = payload.categoryId;
      const existing = access.getBudget(month, categoryId);

      if (existing) {
        const updated = {
          ...existing,
          carryover: payload.carryover,
          updatedAt: new Date().toISOString(),
        };
        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId,
          amount: existing.amount,
          carryover: payload.carryover,
        }) as SyncServerEvent);
      } else {
        const row = createBudget({ month, categoryId, carryover: payload.carryover });
        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId,
          amount: 0,
          carryover: payload.carryover,
        }) as SyncServerEvent);
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_buffer": {
      const existing = access.getBudgetMonth(payload.month);
      if (existing) {
        const updated = {
          ...existing,
          buffered: payload.amount,
          updatedAt: new Date().toISOString(),
        };
        events.push(eventStore.insertEvent(opId, "budget_recalculated", {
          month: toMonthInt(payload.month),
          toBudget: 0,
          buffered: payload.amount,
        }) as SyncServerEvent);
      } else {
        const row = createBudgetMonth({ monthKey: payload.month, buffered: payload.amount });
        events.push(eventStore.insertEvent(opId, "budget_recalculated", {
          month: toMonthInt(payload.month),
          toBudget: 0,
          buffered: payload.amount,
        }) as SyncServerEvent);
      }

      appendBudgetRecalc(events, opId, access, eventStore, toMonthInt(payload.month));
      break;
    }

    case "copy_previous_month": {
      const monthKey = payload.month;
      const prevMk = prevMonthKey(monthKey);
      const month = toMonthInt(monthKey);
      const prevMonth = toMonthInt(prevMk);

      // Get previous month's budgets
      const prevBudgets = access.queryAll<{ category_id: string; amount: number; carryover: number }>(
        `SELECT category_id, amount, carryover FROM budgets WHERE month = ?`,
        prevMonth,
      );

      for (const pb of prevBudgets) {
        const existing = access.getBudget(month, String(pb.category_id));
        if (!existing) {
          const row = createBudget({
            month,
            categoryId: String(pb.category_id),
            amount: Number(pb.amount),
            carryover: Boolean(pb.carryover),
          });
          events.push(eventStore.insertEvent(opId, "category_budget_set", {
            month,
            categoryId: row.categoryId,
            amount: row.amount,
            carryover: row.carryover,
          }) as SyncServerEvent);
        }
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_3month_avg": {
      const monthKey = payload.month;
      const month = toMonthInt(monthKey);
      const monthNum = month % 100;
      const year = Math.floor(month / 100);

      // Get categories
      const cats = access.queryAll<{ id: string }>("SELECT id FROM categories WHERE hidden = 0");

      for (const cat of cats) {
        const categoryId = String(cat.id);
        const amounts: number[] = [];

        for (let i = 1; i <= 3; i++) {
          let m = month - i;
          let y = year;
          if ((month - i) % 100 === 0) {
            m = (year - 1) * 100 + 12;
          }
          const existing = access.getBudget(m, categoryId);
          if (existing) amounts.push(existing.amount);
        }

        if (amounts.length > 0) {
          const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
          const existing = access.getBudget(month, categoryId);
          if (existing) {
            events.push(eventStore.insertEvent(opId, "category_budget_set", {
              month,
              categoryId,
              amount: avg,
              carryover: existing.carryover,
            }) as SyncServerEvent);
          } else {
            const row = createBudget({ month, categoryId, amount: avg });
            events.push(eventStore.insertEvent(opId, "category_budget_set", {
              month,
              categoryId,
              amount: avg,
              carryover: false,
            }) as SyncServerEvent);
          }
        }
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_nmonth_avg": {
      const monthKey = payload.month;
      const n = payload.months ?? 3;
      const month = toMonthInt(monthKey);

      const cats = access.queryAll<{ id: string }>("SELECT id FROM categories WHERE hidden = 0");

      for (const cat of cats) {
        const categoryId = String(cat.id);
        const amounts: number[] = [];

        for (let i = 1; i <= n; i++) {
          const m = month - i;
          const existing = access.getBudget(m, categoryId);
          if (existing) amounts.push(existing.amount);
        }

        if (amounts.length > 0) {
          const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
          const existing = access.getBudget(month, categoryId);
          events.push(eventStore.insertEvent(opId, "category_budget_set", {
            month,
            categoryId,
            amount: avg,
            carryover: existing?.carryover ?? false,
          }) as SyncServerEvent);
        }
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_zero": {
      const month = toMonthInt(payload.month);
      access.exec(`DELETE FROM budgets WHERE month = ?`, month);
      // Re-insert all categories with 0 budget
      const cats = access.queryAll<{ id: string }>("SELECT id FROM categories WHERE hidden = 0");
      for (const cat of cats) {
        const row = createBudget({ month, categoryId: String(cat.id), amount: 0 });
        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId: row.categoryId,
          amount: 0,
          carryover: false,
        }) as SyncServerEvent);
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "apply_goal_templates": {
      const month = toMonthInt(payload.month);
      const cats = access.queryAll<Record<string, unknown>>(
        `SELECT id, goal_def FROM categories WHERE goal_def IS NOT NULL AND hidden = 0`,
      );

      for (const cat of cats) {
        const categoryId = String(cat.id);
        const goalDef = cat.goal_def ? String(cat.goal_def) : null;
        if (!goalDef) continue;

        try {
          const goal = JSON.parse(goalDef);
          let amount = 0;

          if (goal.type === "monthly") {
            amount = goal.amount ?? 0;
          } else if (goal.type === "byDate" && goal.targetDate) {
            // Calculate months remaining
            const targetParts = String(goal.targetDate).split("-");
            const targetMonth = parseInt(targetParts[0]) * 100 + parseInt(targetParts[1]);
            const monthsRemaining = Math.max(1, targetMonth - month);
            const currentBudget = access.getBudget(month, categoryId);
            const savedSoFar = currentBudget?.amount ?? 0;
            amount = Math.round(((goal.amount ?? 0) - savedSoFar) / monthsRemaining);
          }

          if (amount > 0) {
            const existing = access.getBudget(month, categoryId);
            events.push(eventStore.insertEvent(opId, "category_budget_set", {
              month,
              categoryId,
              amount,
              carryover: existing?.carryover ?? false,
            }) as SyncServerEvent);
          }
        } catch {
          // Ignore parse errors in goal defs
        }
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "cover_overspending": {
      const month = toMonthInt(payload.month);
      const fromCategoryId = payload.from;
      const toCategoryId = payload.to;
      const amount = payload.amount;

      // Get current from/to budgets
      const fromBudget = access.getBudget(month, fromCategoryId);
      const toBudget = access.getBudget(month, toCategoryId);

      const transferAmount = amount ?? (toBudget?.amount ?? 0);

      // Reduce from category
      if (fromBudget) {
        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId: fromCategoryId,
          amount: Math.max(0, fromBudget.amount - transferAmount),
          carryover: fromBudget.carryover,
        }) as SyncServerEvent);
      }

      // Increase to category
      if (toBudget) {
        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId: toCategoryId,
          amount: toBudget.amount + transferAmount,
          carryover: toBudget.carryover,
        }) as SyncServerEvent);
      } else {
        const row = createBudget({ month, categoryId: toCategoryId, amount: transferAmount });
        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId: toCategoryId,
          amount: transferAmount,
          carryover: false,
        }) as SyncServerEvent);
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "transfer_budget": {
      const month = toMonthInt(payload.month);
      const fromCategoryId = payload.from;
      const toCategoryId = payload.to;
      const amount = payload.amount;

      const fromBudget = access.getBudget(month, fromCategoryId);
      const toBudget = access.getBudget(month, toCategoryId);

      if (fromBudget && amount <= fromBudget.amount) {
        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId: fromCategoryId,
          amount: fromBudget.amount - amount,
          carryover: fromBudget.carryover,
        }) as SyncServerEvent);

        events.push(eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId: toCategoryId,
          amount: (toBudget?.amount ?? 0) + amount,
          carryover: toBudget?.carryover ?? false,
        }) as SyncServerEvent);
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "hold_for_next_month": {
      const month = toMonthInt(payload.month);
      const existing = access.getBudgetMonth(payload.month);
      if (existing) {
        events.push(eventStore.insertEvent(opId, "budget_recalculated", {
          month,
          toBudget: 0,
          buffered: payload.amount,
        }) as SyncServerEvent);
      } else {
        const row = createBudgetMonth({ monthKey: payload.month, buffered: payload.amount });
        events.push(eventStore.insertEvent(opId, "budget_recalculated", {
          month,
          toBudget: 0,
          buffered: payload.amount,
        }) as SyncServerEvent);
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }
  }

  return { events };
}

function appendBudgetRecalc(
  events: SyncServerEvent[],
  opId: string,
  access: DataAccess,
  eventStore: EventStore,
  month: number,
) {
  const result = computeMonthBudget(access, month);
  if (!result) return;

  events.push(eventStore.insertEvent(opId, "budget_recalculated", {
    month: result.month,
    toBudget: result.toBudget,
    buffered: result.buffered,
  }) as SyncServerEvent);

  for (const cl of result.categoryLeftovers) {
    events.push(eventStore.insertEvent(opId, "category_leftover_changed", {
      month: result.month,
      categoryId: cl.categoryId,
      leftover: cl.leftover,
      leftoverPos: cl.leftoverPos,
      budgeted: cl.budgeted,
      spent: cl.spent,
    }) as SyncServerEvent);
  }
}
