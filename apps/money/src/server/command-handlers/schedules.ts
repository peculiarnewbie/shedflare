import type { DataAccess } from "../data-access";
import { createSchedule } from "../../domain/factories";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export function handleScheduleCommands(commandType: string, payload: any, access: DataAccess): CommandResult {
  switch (commandType) {
    case "create_schedule": {
      const row = createSchedule(payload.schedule);
      access.exec(
        `INSERT INTO schedules (id, name, account_id, payee_id, category_id, amount, start_date, recurrence_rules, active, completed, posts_transaction, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id, row.name, row.accountId, row.payeeId, row.categoryId, row.amount,
        row.startDate, row.recurrenceRules, row.active ? 1 : 0, row.completed ? 1 : 0,
        row.postsTransaction ? 1 : 0, row.createdAt, row.updatedAt,
      );
      return { ok: true, data: { id: row.id } };
    }
    case "update_schedule": {
      const now = new Date().toISOString();
      const fields: string[] = ["updated_at = ?"];
      const params: unknown[] = [now];
      if (payload.fields.name !== undefined) { fields.push("name = ?"); params.push(payload.fields.name); }
      if (payload.fields.accountId !== undefined) { fields.push("account_id = ?"); params.push(payload.fields.accountId); }
      if (payload.fields.payeeId !== undefined) { fields.push("payee_id = ?"); params.push(payload.fields.payeeId); }
      if (payload.fields.categoryId !== undefined) { fields.push("category_id = ?"); params.push(payload.fields.categoryId); }
      if (payload.fields.amount !== undefined) { fields.push("amount = ?"); params.push(payload.fields.amount); }
      if (payload.fields.recurrenceRules !== undefined) { fields.push("recurrence_rules = ?"); params.push(payload.fields.recurrenceRules); }
      params.push(payload.id);
      access.exec(`UPDATE schedules SET ${fields.join(", ")} WHERE id = ?`, ...params);
      return { ok: true, data: { id: payload.id } };
    }
    case "delete_schedule": {
      access.exec("DELETE FROM schedules WHERE id = ?", payload.id);
      return { ok: true, data: { id: payload.id } };
    }
    case "skip_schedule_date": {
      access.exec("UPDATE schedules SET next_date = ?, updated_at = ? WHERE id = ?", payload.nextDate, new Date().toISOString(), payload.id);
      return { ok: true, data: { id: payload.id } };
    }
    case "post_schedule_transaction": {
      access.exec("UPDATE schedules SET completed = 1, updated_at = ? WHERE id = ?", new Date().toISOString(), payload.scheduleId);
      return { ok: true, data: { id: payload.scheduleId } };
    }
    default:
      return { ok: false, error: `Unknown schedule command: ${commandType}` };
  }
}
