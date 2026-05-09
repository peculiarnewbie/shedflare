/**
 * Schedule command handlers — create, update, delete, skip, post transaction.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createSchedule, createTransaction } from "../../domain/factories";

export function handleScheduleCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_schedule") {
    case "create_schedule": {
      const row = createSchedule(payload.schedule);
      events.push(eventStore.insertEvent(opId, "schedule_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_schedule": {
      const existing = access.getSchedule(payload.id);
      if (existing) {
        const fields = payload.fields ?? {};
        const updated = {
          ...existing,
          name: fields.name !== undefined ? fields.name : existing.name,
          accountId: fields.accountId !== undefined ? fields.accountId : existing.accountId,
          payeeId: fields.payeeId !== undefined ? fields.payeeId : existing.payeeId,
          categoryId: fields.categoryId !== undefined ? fields.categoryId : existing.categoryId,
          amount: fields.amount !== undefined ? fields.amount : existing.amount,
          startDate: fields.startDate !== undefined ? fields.startDate : existing.startDate,
          recurrenceRules: fields.recurrenceRules ?? existing.recurrenceRules,
          active: fields.active ?? existing.active,
          completed: fields.completed ?? existing.completed,
          postsTransaction: fields.postsTransaction ?? existing.postsTransaction,
          customUpcomingLength:
            fields.customUpcomingLength !== undefined
              ? fields.customUpcomingLength
              : existing.customUpcomingLength,
          nextDate: fields.nextDate !== undefined ? fields.nextDate : existing.nextDate,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "schedule_updated", { row: updated }) as SyncServerEvent,
        );
      }
      break;
    }

    case "delete_schedule": {
      events.push(
        eventStore.insertEvent(opId, "schedule_deleted", { id: payload.id }) as SyncServerEvent,
      );
      break;
    }

    case "skip_schedule_date": {
      const existing = access.getSchedule(payload.id);
      if (existing) {
        // Compute next occurrence: simple approach — push to next month
        const nextDate = existing.nextDate;
        if (nextDate) {
          const d = new Date(nextDate);
          d.setMonth(d.getMonth() + 1);
          const updated = {
            ...existing,
            nextDate: d.toISOString().slice(0, 10),
            updatedAt: new Date().toISOString(),
          };
          events.push(
            eventStore.insertEvent(opId, "schedule_updated", { row: updated }) as SyncServerEvent,
          );
        }
      }
      break;
    }

    case "post_schedule_transaction": {
      const existing = access.getSchedule(payload.scheduleId);
      if (existing && existing.accountId) {
        const tx = createTransaction({
          accountId: existing.accountId,
          categoryId: existing.categoryId ?? undefined,
          amount: existing.amount ?? 0,
          payee: existing.payeeId
            ? (access.getPayee(existing.payeeId)?.name ?? undefined)
            : undefined,
          date: new Date().toISOString().slice(0, 10),
        });
        events.push(
          eventStore.insertEvent(opId, "transaction_created", { row: tx }) as SyncServerEvent,
        );

        // Update next date
        if (existing.nextDate) {
          const d = new Date(existing.nextDate);
          d.setMonth(d.getMonth() + 1);
          const updated = {
            ...existing,
            nextDate: d.toISOString().slice(0, 10),
            updatedAt: new Date().toISOString(),
          };
          events.push(
            eventStore.insertEvent(opId, "schedule_updated", { row: updated }) as SyncServerEvent,
          );
        }
      }
      break;
    }
  }

  return { events };
}
