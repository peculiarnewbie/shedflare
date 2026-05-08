/**
 * Transaction command handlers — create, update, delete, split.
 */
import * as Schema from "effect/Schema";
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createTransaction } from "../../domain/factories";
import { TransactionInput } from "../../domain/types";
import { computeMonthBudget } from "../budget-engine";
import { toMonthInt } from "../../domain/types";

export function handleTransactionCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_transaction") {
    case "create_transaction": {
      // Validate with Effect/Schema
      const parsed = Schema.decodeUnknownSync(TransactionInput)(payload.row);
      const row = createTransaction(parsed);
      events.push(eventStore.insertEvent(opId, "transaction_created", { row }) as SyncServerEvent);

      // Recalculate budget for the affected month
      const month = toMonthInt(row.date.slice(0, 7));
      appendBudgetRecalculation(events, opId, access, eventStore, month);
      break;
    }

    case "update_transaction": {
      const existing = access.getTransaction(payload.id);
      if (existing) {
        const updated = {
          ...existing,
          accountId: payload.fields.accountId ?? existing.accountId,
          categoryId: payload.fields.categoryId !== undefined ? payload.fields.categoryId : existing.categoryId,
          amount: payload.fields.amount ?? existing.amount,
          payee: payload.fields.payee !== undefined ? payload.fields.payee : existing.payee,
          notes: payload.fields.notes !== undefined ? payload.fields.notes : existing.notes,
          date: payload.fields.date ?? existing.date,
          cleared: payload.fields.cleared ?? existing.cleared,
          importedDescription: payload.fields.importedDescription !== undefined
            ? payload.fields.importedDescription : existing.importedDescription,
          sortOrder: payload.fields.sortOrder ?? existing.sortOrder,
          updatedAt: new Date().toISOString(),
        };
        events.push(eventStore.insertEvent(opId, "transaction_updated", { row: updated }) as SyncServerEvent);

        // Recalculate budget for old and new month
        const oldMonth = toMonthInt(existing.date.slice(0, 7));
        const newMonth = payload.fields.date ? toMonthInt(payload.fields.date.slice(0, 7)) : oldMonth;
        if (oldMonth !== newMonth) {
          appendBudgetRecalculation(events, opId, access, eventStore, oldMonth);
        }
        appendBudgetRecalculation(events, opId, access, eventStore, newMonth);
      }
      break;
    }

    case "delete_transaction": {
      const existing = access.getTransaction(payload.id);
      if (existing) {
        events.push(eventStore.insertEvent(opId, "transaction_deleted", { id: payload.id }) as SyncServerEvent);

        // Recalculate budget for the affected month
        const month = toMonthInt(existing.date.slice(0, 7));
        appendBudgetRecalculation(events, opId, access, eventStore, month);
      }
      break;
    }

    case "split_transaction": {
      const parent = access.getTransaction(payload.parentId);
      if (parent) {
        // Mark parent as split
        const updatedParent = {
          ...parent,
          isParent: true,
          updatedAt: new Date().toISOString(),
        };
        events.push(eventStore.insertEvent(opId, "transaction_updated", { row: updatedParent }) as SyncServerEvent);

        // Create child transactions
        for (const childInput of (payload.children as any[]) ?? []) {
          const child = createTransaction({
            ...childInput,
            accountId: parent.accountId,
            date: parent.date,
            isChild: true,
            parentId: parent.id,
          });
          events.push(eventStore.insertEvent(opId, "transaction_created", { row: child }) as SyncServerEvent);
        }

        const month = toMonthInt(parent.date.slice(0, 7));
        appendBudgetRecalculation(events, opId, access, eventStore, month);
      }
      break;
    }
  }

  return { events };
}

/** Helper: compute budget recalc events for a month and append to events array. */
function appendBudgetRecalculation(
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
