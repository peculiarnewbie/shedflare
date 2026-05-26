import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createSchedule } from "../../domain/factories";
import { nowIso } from "../../domain/types";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function handleScheduleCommands(c: string, p: any, db: Db): Promise<CR> {
  switch (c) {
    case "create_schedule": {
      const row = createSchedule(p.schedule);
      await db.insert(s.schedules).values(row);
      return { ok: true, data: { id: row.id } };
    }
    case "update_schedule": {
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      const f = p.fields;
      if (f.name !== undefined) set.name = f.name;
      if (f.accountId !== undefined) set.accountId = f.accountId;
      if (f.payeeId !== undefined) set.payeeId = f.payeeId;
      if (f.categoryId !== undefined) set.categoryId = f.categoryId;
      if (f.amount !== undefined) set.amount = f.amount;
      if (f.recurrenceRules !== undefined) set.recurrenceRules = f.recurrenceRules;
      await db.update(s.schedules).set(set).where(eq(s.schedules.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    case "delete_schedule": {
      await db.delete(s.schedules).where(eq(s.schedules.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    case "skip_schedule_date": {
      await db
        .update(s.schedules)
        .set({ nextDate: p.nextDate, updatedAt: nowIso() })
        .where(eq(s.schedules.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    case "post_schedule_transaction": {
      await db
        .update(s.schedules)
        .set({ completed: true, updatedAt: nowIso() })
        .where(eq(s.schedules.id, p.scheduleId));
      return { ok: true, data: { id: p.scheduleId } };
    }
    default:
      return { ok: false, error: `Unknown schedule command: ${c}` };
  }
}
