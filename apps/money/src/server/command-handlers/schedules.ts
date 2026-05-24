/**
 * Schedule command handlers — create, update, delete, skip, post transaction.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createSchedule, createTransaction } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";
import { castId, type ScheduleId, type PayeeId } from "../../domain/types";

function parseRecurrenceConfig(recurrenceRules: string): any {
  try {
    const parsed = JSON.parse(recurrenceRules);
    return typeof parsed === "object" ? parsed : { type: parsed };
  } catch {
    return { type: "monthly" };
  }
}

function applyWeekendAdjustment(date: Date, config: any): Date {
  if (!config.skipWeekend) return date;
  const day = date.getDay();
  if (day === 0 || day === 6) {
    const d = new Date(date);
    if (config.weekendSolveMode === "before") {
      // Move to Friday
      d.setDate(d.getDate() - (day === 0 ? 2 : 1));
    } else {
      // Move to Monday
      d.setDate(d.getDate() + (day === 0 ? 1 : 2));
    }
    return d;
  }
  return date;
}

function checkEndCondition(config: any, advanceCount: number): boolean {
  if (config.endMode === "after_n_occurrences" && config.endOccurrences) {
    return advanceCount >= config.endOccurrences;
  }
  return false;
}

function advanceNextDate(
  currentNextDate: string,
  config: any,
  _advanceCount: number,
): string | null {
  const d = new Date(currentNextDate);
  const freq = config.type ?? "monthly";
  const interval = config.interval ?? 1;

  switch (freq) {
    case "daily":
      d.setDate(d.getDate() + interval);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7 * interval);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14 * interval);
      break;
    case "monthly":
    default:
      d.setMonth(d.getMonth() + interval);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3 * interval);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + interval);
      break;
  }

  const adjusted = applyWeekendAdjustment(d, config);
  return adjusted.toISOString().slice(0, 10);
}

export function handleScheduleCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_schedule") {
    case "create_schedule": {
      const valid = decodeCommand("create_schedule", payload);
      const row = createSchedule(valid.schedule);
      events.push(eventStore.insertEvent(opId, "schedule_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_schedule": {
      const valid = decodeCommand("update_schedule", payload);
      const existing = access.getSchedule(castId<ScheduleId>(valid.id));
      if (existing) {
        const fields = valid.fields;
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
      const valid = decodeCommand("delete_schedule", payload);
      events.push(
        eventStore.insertEvent(opId, "schedule_deleted", { id: valid.id }) as SyncServerEvent,
      );
      break;
    }

    case "skip_schedule_date": {
      const valid = decodeCommand("skip_schedule_date", payload);
      const existing = access.getSchedule(castId<ScheduleId>(valid.id));
      if (existing) {
        const nextDate = existing.nextDate;
        if (nextDate) {
          const config = parseRecurrenceConfig(existing.recurrenceRules ?? "{}");
          const skipCount = (existing as any)._skipCount ?? 0;
          const nextAdvance = advanceNextDate(nextDate, config, skipCount + 1);
          const reachedEnd = checkEndCondition(config, skipCount + 1);
          const updated: any = {
            ...existing,
            _skipCount: skipCount + 1,
            updatedAt: new Date().toISOString(),
          };
          if (reachedEnd) {
            updated.completed = true;
            updated.nextDate = null;
          } else {
            updated.nextDate = nextAdvance;
          }
          events.push(
            eventStore.insertEvent(opId, "schedule_updated", { row: updated }) as SyncServerEvent,
          );
        }
      }
      break;
    }

    case "post_schedule_transaction": {
      const valid = decodeCommand("post_schedule_transaction", payload);
      const existing = access.getSchedule(castId<ScheduleId>(valid.scheduleId));
      if (existing && existing.accountId) {
        const tx = createTransaction({
          accountId: existing.accountId,
          categoryId: existing.categoryId ?? undefined,
          amount: existing.amount ?? 0,
          payee: existing.payeeId
            ? (access.getPayee(castId<PayeeId>(existing.payeeId))?.name ?? undefined)
            : undefined,
          date: new Date().toISOString().slice(0, 10),
          scheduleId: existing.id,
        });
        events.push(
          eventStore.insertEvent(opId, "transaction_created", { row: tx }) as SyncServerEvent,
        );
        if (existing.nextDate) {
          const config = parseRecurrenceConfig(existing.recurrenceRules ?? "{}");
          const postCount = (existing as any)._postCount ?? 0;
          const nextAdvance = advanceNextDate(existing.nextDate, config, postCount + 1);
          const reachedEnd = checkEndCondition(config, postCount + 1);
          const updated: any = {
            ...existing,
            _postCount: postCount + 1,
            updatedAt: new Date().toISOString(),
          };
          if (reachedEnd) {
            updated.completed = true;
            updated.nextDate = null;
          } else {
            updated.nextDate = nextAdvance;
          }
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
