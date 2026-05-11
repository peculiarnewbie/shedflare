/**
 * Budget command handlers — set amounts, carryover, buffer, copy, average,
 * goal templates, cover overspending, transfer, hold.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createBudget, createBudgetMonth } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";
import { computeMonthBudget } from "../budget-engine";
import { toMonthInt, prevMonthKey, fromMonthInt, castId } from "../../domain/types";

export function handleBudgetCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "set_budget_amount") {
    case "set_budget_amount": {
      const valid = decodeCommand("set_budget_amount", payload);
      const month = valid.month;
      const categoryId = valid.categoryId;
      const existing = access.getBudget(month, categoryId);

      events.push(
        eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId,
          amount: valid.amount,
          carryover: existing?.carryover ?? false,
        }) as SyncServerEvent,
      );

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_budget_carryover": {
      const valid = decodeCommand("set_budget_carryover", payload);
      const month = valid.month;
      const categoryId = valid.categoryId;

      events.push(
        eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId,
          amount: 0,
          carryover: valid.carryover,
        }) as SyncServerEvent,
      );

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_buffer": {
      const valid = decodeCommand("set_buffer", payload);
      events.push(
        eventStore.insertEvent(opId, "budget_recalculated", {
          month: toMonthInt(valid.month),
          toBudget: 0,
          buffered: valid.amount,
        }) as SyncServerEvent,
      );

      appendBudgetRecalc(events, opId, access, eventStore, toMonthInt(valid.month));
      break;
    }

    case "copy_previous_month": {
      const valid = decodeCommand("copy_previous_month", payload);
      const monthKey = valid.month;
      const prevMk = prevMonthKey(monthKey);
      const month = toMonthInt(monthKey);
      const prevMonth = toMonthInt(prevMk);

      const prevBudgets = access.queryAll<{
        category_id: string;
        amount: number;
        carryover: number;
      }>(`SELECT category_id, amount, carryover FROM budgets WHERE month = ?`, prevMonth);

      for (const pb of prevBudgets) {
        const existing = access.getBudget(month, String(pb.category_id));
        if (!existing) {
          const row = createBudget({
            month,
            categoryId: String(pb.category_id),
            amount: Number(pb.amount),
            carryover: Boolean(pb.carryover),
          });
          events.push(
            eventStore.insertEvent(opId, "category_budget_set", {
              month,
              categoryId: row.categoryId,
              amount: row.amount,
              carryover: row.carryover,
            }) as SyncServerEvent,
          );
        }
      }

      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_3month_avg": {
      const valid = decodeCommand("set_3month_avg", payload);
      const monthKey = valid.month;
      const month = toMonthInt(monthKey);
      const year = Math.floor(month / 100);
      const cats = access.queryAll<{ id: string }>("SELECT id FROM categories WHERE hidden = 0");

      for (const cat of cats) {
        const categoryId = String(cat.id);
        const amounts: number[] = [];
        for (let i = 1; i <= 3; i++) {
          let m = month - i;
          if ((month - i) % 100 === 0) {
            m = (year - 1) * 100 + 12;
          }
          const existing = access.getBudget(m, categoryId);
          if (existing) amounts.push(existing.amount);
        }
        if (amounts.length > 0) {
          const avg = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
          const existing = access.getBudget(month, categoryId);
          events.push(
            eventStore.insertEvent(opId, "category_budget_set", {
              month,
              categoryId,
              amount: avg,
              carryover: existing?.carryover ?? false,
            }) as SyncServerEvent,
          );
        }
      }
      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_nmonth_avg": {
      const valid = decodeCommand("set_nmonth_avg", payload);
      const month = toMonthInt(valid.month);
      const n = valid.months;
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
          events.push(
            eventStore.insertEvent(opId, "category_budget_set", {
              month,
              categoryId,
              amount: avg,
              carryover: existing?.carryover ?? false,
            }) as SyncServerEvent,
          );
        }
      }
      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "set_zero": {
      const valid = decodeCommand("set_zero", payload);
      const month = toMonthInt(valid.month);
      access.exec(`DELETE FROM budgets WHERE month = ?`, month);
      const cats = access.queryAll<{ id: string }>("SELECT id FROM categories WHERE hidden = 0");
      for (const cat of cats) {
        const row = createBudget({ month, categoryId: String(cat.id), amount: 0 });
        events.push(
          eventStore.insertEvent(opId, "category_budget_set", {
            month,
            categoryId: row.categoryId,
            amount: 0,
            carryover: false,
          }) as SyncServerEvent,
        );
      }
      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "apply_goal_templates": {
      const valid = decodeCommand("apply_goal_templates", payload);
      const month = toMonthInt(valid.month);
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
            const targetParts = String(goal.targetDate).split("-");
            const targetMonth = parseInt(targetParts[0]) * 100 + parseInt(targetParts[1]);
            const monthsRemaining = Math.max(1, targetMonth - month);
            const currentBudget = access.getBudget(month, categoryId);
            const savedSoFar = currentBudget?.amount ?? 0;
            amount = Math.round(((goal.amount ?? 0) - savedSoFar) / monthsRemaining);
          }
          if (amount > 0) {
            const existing = access.getBudget(month, categoryId);
            events.push(
              eventStore.insertEvent(opId, "category_budget_set", {
                month,
                categoryId,
                amount,
                carryover: existing?.carryover ?? false,
              }) as SyncServerEvent,
            );
          }
        } catch {
          /* ignore parse errors */
        }
      }
      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "cover_overspending": {
      const valid = decodeCommand("cover_overspending", payload);
      const month = toMonthInt(valid.month);
      const fromBudget = access.getBudget(month, valid.from);
      const transferAmount = valid.amount ?? fromBudget?.amount ?? 0;

      if (fromBudget) {
        events.push(
          eventStore.insertEvent(opId, "category_budget_set", {
            month,
            categoryId: valid.from,
            amount: Math.max(0, fromBudget.amount - transferAmount),
            carryover: fromBudget.carryover,
          }) as SyncServerEvent,
        );
      }
      events.push(
        eventStore.insertEvent(opId, "category_budget_set", {
          month,
          categoryId: valid.to,
          amount: (access.getBudget(month, valid.to)?.amount ?? 0) + transferAmount,
          carryover: access.getBudget(month, valid.to)?.carryover ?? false,
        }) as SyncServerEvent,
      );
      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "transfer_budget": {
      const valid = decodeCommand("transfer_budget", payload);
      const month = toMonthInt(valid.month);
      const fromBudget = access.getBudget(month, valid.from);
      const toBudget = access.getBudget(month, valid.to);

      if (fromBudget && valid.amount <= fromBudget.amount) {
        events.push(
          eventStore.insertEvent(opId, "category_budget_set", {
            month,
            categoryId: valid.from,
            amount: fromBudget.amount - valid.amount,
            carryover: fromBudget.carryover,
          }) as SyncServerEvent,
        );
        events.push(
          eventStore.insertEvent(opId, "category_budget_set", {
            month,
            categoryId: valid.to,
            amount: (toBudget?.amount ?? 0) + valid.amount,
            carryover: toBudget?.carryover ?? false,
          }) as SyncServerEvent,
        );
      }
      appendBudgetRecalc(events, opId, access, eventStore, month);
      break;
    }

    case "hold_for_next_month": {
      const valid = decodeCommand("hold_for_next_month", payload);
      const month = toMonthInt(valid.month);
      events.push(
        eventStore.insertEvent(opId, "budget_recalculated", {
          month,
          toBudget: 0,
          buffered: valid.amount,
        }) as SyncServerEvent,
      );
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

  events.push(
    eventStore.insertEvent(opId, "budget_recalculated", {
      month: result.month,
      toBudget: result.toBudget,
      buffered: result.buffered,
    }) as SyncServerEvent,
  );

  for (const cl of result.categoryLeftovers) {
    events.push(
      eventStore.insertEvent(opId, "category_leftover_changed", {
        month: result.month,
        categoryId: cl.categoryId,
        leftover: cl.leftover,
        leftoverPos: cl.leftoverPos,
        budgeted: cl.budgeted,
        spent: cl.spent,
      }) as SyncServerEvent,
    );
  }
}
