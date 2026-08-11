import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createSchedule, createTransaction } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";
import type { Schedule } from "../../db/schema";

type ScheduleCommand =
  | "create_schedule"
  | "update_schedule"
  | "delete_schedule"
  | "skip_schedule_date"
  | "post_schedule_transaction";

type RecurrenceConfig = {
  type?: string;
  skipWeekend?: boolean;
  weekendSolveMode?: "before" | "after";
  endMode?: "never" | "after_n" | "after_n_occurrences" | "on_date";
  endOccurrences?: number;
  endDate?: string;
};

function parseRecurrenceConfig(rules: string): RecurrenceConfig {
  try {
    const parsed: unknown = JSON.parse(rules);
    if (parsed && typeof parsed === "object") return parsed as RecurrenceConfig;
    if (typeof parsed === "string") return { type: parsed };
  } catch {
    return { type: rules || "monthly" };
  }
  return { type: "monthly" };
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function applyWeekendHandling(date: Date, config: RecurrenceConfig): Date {
  if (!config.skipWeekend) return date;
  const day = date.getUTCDay();
  const next = new Date(date);
  if (day === 6)
    next.setUTCDate(next.getUTCDate() + (config.weekendSolveMode === "before" ? -1 : 2));
  if (day === 0)
    next.setUTCDate(next.getUTCDate() + (config.weekendSolveMode === "before" ? -2 : 1));
  return next;
}

function nextScheduleState(
  schedule: Schedule,
): Pick<Schedule, "nextDate" | "completed" | "recurrenceRules"> {
  const config = parseRecurrenceConfig(schedule.recurrenceRules);
  const current = new Date(
    `${schedule.nextDate ?? schedule.startDate ?? toDateOnly(new Date())}T00:00:00.000Z`,
  );
  const type = config.type ?? "monthly";
  const next =
    type === "daily"
      ? new Date(current.setUTCDate(current.getUTCDate() + 1))
      : type === "weekly"
        ? new Date(current.setUTCDate(current.getUTCDate() + 7))
        : type === "biweekly"
          ? new Date(current.setUTCDate(current.getUTCDate() + 14))
          : type === "quarterly"
            ? addMonths(current, 3)
            : type === "yearly"
              ? addMonths(current, 12)
              : addMonths(current, 1);
  const nextDate = toDateOnly(applyWeekendHandling(next, config));
  const remainingOccurrences =
    config.endMode === "after_n" || config.endMode === "after_n_occurrences"
      ? config.endOccurrences
      : undefined;
  const completedByCount = remainingOccurrences !== undefined && remainingOccurrences <= 1;
  const completedByDate =
    config.endMode === "on_date" && !!config.endDate && nextDate > config.endDate;
  const nextConfig = { ...config };
  if (remainingOccurrences !== undefined) {
    nextConfig.endOccurrences = Math.max(remainingOccurrences - 1, 0);
  }
  return {
    nextDate: completedByCount || completedByDate ? null : nextDate,
    completed: completedByCount || completedByDate,
    recurrenceRules: JSON.stringify(nextConfig),
  };
}

export async function handleScheduleCommands(
  c: ScheduleCommand,
  p: CommandPayloadMap[ScheduleCommand],
  db: Db,
): Promise<CommandResult> {
  switch (c) {
    case "create_schedule": {
      const pp = p as CommandPayloadMap["create_schedule"];
      const row = createSchedule(pp.schedule);
      await db.insert(s.schedules).values(row).run();
      return { ok: true, data: { id: row.id } };
    }
    case "update_schedule": {
      const pp = p as CommandPayloadMap["update_schedule"];
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      const f = pp.fields;
      if (f.name !== undefined) set.name = f.name;
      if (f.accountId !== undefined) set.accountId = f.accountId;
      if (f.payeeId !== undefined) set.payeeId = f.payeeId;
      if (f.categoryId !== undefined) set.categoryId = f.categoryId;
      if (f.amount !== undefined) set.amount = f.amount;
      if (f.recurrenceRules !== undefined) set.recurrenceRules = f.recurrenceRules;
      await db.update(s.schedules).set(set).where(eq(s.schedules.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_schedule": {
      const pp = p as CommandPayloadMap["delete_schedule"];
      await db.delete(s.schedules).where(eq(s.schedules.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    case "skip_schedule_date": {
      const pp = p as CommandPayloadMap["skip_schedule_date"];
      const [schedule] = await db.select().from(s.schedules).where(eq(s.schedules.id, pp.id)).all();
      if (!schedule) return { ok: false, error: "Schedule not found" };
      const next = nextScheduleState(schedule);
      await db
        .update(s.schedules)
        .set({ ...next, updatedAt: nowIso() })
        .where(eq(s.schedules.id, pp.id))
        .run();
      return { ok: true, data: { id: pp.id, ...next } };
    }
    case "post_schedule_transaction": {
      const pp = p as CommandPayloadMap["post_schedule_transaction"];
      const [schedule] = await db
        .select()
        .from(s.schedules)
        .where(eq(s.schedules.id, pp.scheduleId))
        .all();
      if (!schedule) return { ok: false, error: "Schedule not found" };
      if (!schedule.accountId) return { ok: false, error: "Schedule has no account" };
      if (schedule.amount === null) return { ok: false, error: "Schedule has no amount" };

      const [payee] = schedule.payeeId
        ? await db
            .select({ name: s.payees.name })
            .from(s.payees)
            .where(eq(s.payees.id, schedule.payeeId))
            .all()
        : [];
      const transaction = createTransaction({
        accountId: schedule.accountId,
        categoryId: schedule.categoryId,
        amount: schedule.amount,
        payee: payee?.name ?? schedule.name,
        date: schedule.nextDate ?? schedule.startDate ?? toDateOnly(new Date()),
        scheduleId: schedule.id,
      });
      await db.insert(s.transactions).values(transaction).run();

      const next = nextScheduleState(schedule);
      await db
        .update(s.schedules)
        .set({ ...next, updatedAt: nowIso() })
        .where(eq(s.schedules.id, pp.scheduleId))
        .run();
      return { ok: true, data: { id: pp.scheduleId, transactionId: transaction.id, ...next } };
    }
    default:
      return { ok: false, error: "Unknown schedule command: " + String(c) };
  }
}
