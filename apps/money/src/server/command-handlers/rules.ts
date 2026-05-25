/**
 * Rule command handlers — create, update, delete.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createRule } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";

export function handleRuleCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_rule") {
    case "create_rule": {
      const valid = decodeCommand("create_rule", payload);
      const row = createRule({
        stage: valid.rule?.stage,
        conditionsOp: valid.rule?.conditionsOp,
        conditions: valid.rule?.conditions ?? "[]",
        actions: valid.rule?.actions ?? "[]",
      });
      events.push(eventStore.insertEvent(opId, "rule_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_rule": {
      const valid = decodeCommand("update_rule", payload);
      const existing = access.queryOne<Record<string, unknown>>(
        `SELECT * FROM rules WHERE id = ?`,
        valid.id,
      );
      if (existing) {
        const fields = valid.fields;
        const now = new Date().toISOString();
        access.exec(
          `UPDATE rules SET stage = ?, conditions_op = ?, conditions = ?, actions = ?, active = ?, updated_at = ? WHERE id = ?`,
          fields.stage ?? existing.stage,
          fields.conditionsOp ?? existing.conditions_op,
          fields.conditions ?? existing.conditions,
          fields.actions ?? existing.actions,
          fields.active !== undefined ? (fields.active ? 1 : 0) : existing.active,
          now,
          valid.id,
        );
        const updated = access.queryOne<Record<string, unknown>>(
          `SELECT * FROM rules WHERE id = ?`,
          valid.id,
        );
        if (updated) {
          events.push(
            eventStore.insertEvent(opId, "rule_updated", {
              row: updated as any,
            }) as SyncServerEvent,
          );
        }
      }
      break;
    }

    case "delete_rule": {
      const now = new Date().toISOString();
      access.exec(`UPDATE rules SET deleted = 1, updated_at = ? WHERE id = ?`, now, payload.id);
      const updated = access.queryOne<Record<string, unknown>>(
        `SELECT * FROM rules WHERE id = ?`,
        payload.id,
      );
      if (updated) {
        events.push(
          eventStore.insertEvent(opId, "rule_updated", { row: updated as any }) as SyncServerEvent,
        );
      }
      break;
    }
  }

  return { events };
}
