/**
 * Transaction command handlers — create, update, delete, split.
 */
import * as Schema from "effect/Schema";
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createTransaction } from "../../domain/factories";
import { TransactionInput } from "../../domain/schemas";
import { decodeCommand } from "../../domain/commands";
import { computeMonthBudget } from "../budget-engine";
import { toMonthInt, castId, type TransactionId } from "../../domain/types";

export function handleTransactionCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_transaction") {
    case "create_transaction": {
      const valid = decodeCommand("create_transaction", payload);
      const parsed = Schema.decodeUnknownSync(TransactionInput as any)(valid.row) as any;
      const row = createTransaction(parsed);
      events.push(eventStore.insertEvent(opId, "transaction_created", { row }) as SyncServerEvent);

      const month = toMonthInt(row.date.slice(0, 7));
      appendBudgetRecalculation(events, opId, access, eventStore, month);
      break;
    }

    case "update_transaction": {
      const valid = decodeCommand("update_transaction", payload);
      const existing = access.getTransaction(castId<TransactionId>(valid.id));
      if (existing) {
        const updated = {
          ...existing,
          accountId: valid.fields.accountId ?? existing.accountId,
          categoryId:
            valid.fields.categoryId !== undefined ? valid.fields.categoryId : existing.categoryId,
          amount: valid.fields.amount ?? existing.amount,
          payee: valid.fields.payee !== undefined ? valid.fields.payee : existing.payee,
          notes: valid.fields.notes !== undefined ? valid.fields.notes : existing.notes,
          date: valid.fields.date ?? existing.date,
          cleared: valid.fields.cleared ?? existing.cleared,
          importedDescription:
            valid.fields.importedDescription !== undefined
              ? valid.fields.importedDescription
              : existing.importedDescription,
          sortOrder: valid.fields.sortOrder ?? existing.sortOrder,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "transaction_updated", { row: updated }) as SyncServerEvent,
        );

        const oldMonth = toMonthInt(existing.date.slice(0, 7));
        const newMonth = valid.fields.date ? toMonthInt(valid.fields.date.slice(0, 7)) : oldMonth;
        if (oldMonth !== newMonth) {
          appendBudgetRecalculation(events, opId, access, eventStore, oldMonth);
        }
        appendBudgetRecalculation(events, opId, access, eventStore, newMonth);
      }
      break;
    }

    case "delete_transaction": {
      const valid = decodeCommand("delete_transaction", payload);
      const existing = access.getTransaction(castId<TransactionId>(valid.id));
      if (existing) {
        events.push(
          eventStore.insertEvent(opId, "transaction_deleted", {
            id: valid.id,
          }) as SyncServerEvent,
        );

        const month = toMonthInt(existing.date.slice(0, 7));
        appendBudgetRecalculation(events, opId, access, eventStore, month);
      }
      break;
    }

    case "split_transaction": {
      const valid = decodeCommand("split_transaction", payload);
      const parent = access.getTransaction(castId<TransactionId>(valid.parentId));
      if (parent) {
        const updatedParent = {
          ...parent,
          isParent: true,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "transaction_updated", {
            row: updatedParent,
          }) as SyncServerEvent,
        );

        for (const childInput of valid.children) {
          const child = createTransaction({
            ...childInput,
            accountId: parent.accountId,
            date: parent.date,
            isChild: true,
            parentId: parent.id,
          });
          events.push(
            eventStore.insertEvent(opId, "transaction_created", { row: child }) as SyncServerEvent,
          );
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
