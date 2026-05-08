/**
 * Rule command handlers — create, update, delete.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createRule } from "../../domain/factories";

export function handleRuleCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_rule") {
    case "create_rule": {
      const row = createRule({
        stage: payload.rule?.stage,
        conditionsOp: payload.rule?.conditionsOp,
        conditions: payload.rule?.conditions ?? "[]",
        actions: payload.rule?.actions ?? "[]",
      });
      events.push(eventStore.insertEvent(opId, "rule_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_rule": {
      const existing = access.queryOne<Record<string, unknown>>(
        `SELECT * FROM rules WHERE id = ?`,
        payload.id,
      );
      if (existing) {
        const fields = payload.fields ?? {};
        const now = new Date().toISOString();
        access.exec(
          `UPDATE rules SET stage = ?, conditions_op = ?, conditions = ?, actions = ?, updated_at = ? WHERE id = ?`,
          fields.stage ?? existing.stage,
          fields.conditionsOp ?? existing.conditions_op,
          fields.conditions ?? existing.conditions,
          fields.actions ?? existing.actions,
          now,
          payload.id,
        );
        const updated = access.queryOne<Record<string, unknown>>(
          `SELECT * FROM rules WHERE id = ?`, payload.id,
        );
        if (updated) {
          events.push(eventStore.insertEvent(opId, "rule_updated", {
            row: updated as any,
          }) as SyncServerEvent);
        }
      }
      break;
    }

    case "delete_rule": {
      access.exec(`DELETE FROM rules WHERE id = ?`, payload.id);
      // No delete event for rules — they're simple CRUD
      break;
    }
  }

  return { events };
}
