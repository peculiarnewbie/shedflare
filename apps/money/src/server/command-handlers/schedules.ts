import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createSchedule } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

type ScheduleCommand =
  | "create_schedule"
  | "update_schedule"
  | "delete_schedule"
  | "skip_schedule_date"
  | "post_schedule_transaction";

export async function handleScheduleCommands(
  c: ScheduleCommand,
  p: CommandPayloadMap[ScheduleCommand],
  db: Db,
): Promise<CR> {
  switch (c) {
    case "create_schedule": {
      const pp = p as CommandPayloadMap["create_schedule"];
      const row = createSchedule(pp.schedule);
      await db.insert(s.schedules).values(row);
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
      await db.update(s.schedules).set(set).where(eq(s.schedules.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_schedule": {
      const pp = p as CommandPayloadMap["delete_schedule"];
      await db.delete(s.schedules).where(eq(s.schedules.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "skip_schedule_date": {
      const pp = p as CommandPayloadMap["skip_schedule_date"];
      await db
        .update(s.schedules)
        .set({ nextDate: pp.nextDate, updatedAt: nowIso() })
        .where(eq(s.schedules.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "post_schedule_transaction": {
      const pp = p as CommandPayloadMap["post_schedule_transaction"];
      await db
        .update(s.schedules)
        .set({ completed: true, updatedAt: nowIso() })
        .where(eq(s.schedules.id, pp.scheduleId));
      return { ok: true, data: { id: pp.scheduleId } };
    }
    default:
      return { ok: false, error: `Unknown schedule command: ${c}` };
  }
}
