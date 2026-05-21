import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createTransactionFilter } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";

export function handleFilterCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_filter") {
    case "create_filter": {
      const valid = decodeCommand("create_filter", payload);
      const row = createTransactionFilter({
        name: valid.filter.name,
        conditions: valid.filter.conditions,
        conditionsOp: valid.filter.conditionsOp,
      });
      events.push(eventStore.insertEvent(opId, "filter_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_filter": {
      const valid = decodeCommand("update_filter", payload);
      const existing = access.queryOne<Record<string, unknown>>(
        `SELECT * FROM transaction_filters WHERE id = ?`,
        valid.id,
      );
      if (existing) {
        const f = valid.fields;
        const now = new Date().toISOString();
        access.exec(
          `UPDATE transaction_filters SET name = ?, conditions = ?, conditions_op = ?, updated_at = ? WHERE id = ?`,
          f.name ?? existing.name,
          f.conditions ?? existing.conditions,
          f.conditionsOp ?? existing.conditions_op,
          now,
          valid.id,
        );
        const updated = access.queryOne<Record<string, unknown>>(
          `SELECT * FROM transaction_filters WHERE id = ?`,
          valid.id,
        );
        if (updated) {
          events.push(
            eventStore.insertEvent(opId, "filter_updated", {
              row: updated as any,
            }) as SyncServerEvent,
          );
        }
      }
      break;
    }

    case "delete_filter": {
      access.exec(`DELETE FROM transaction_filters WHERE id = ?`, payload.id);
      break;
    }
  }

  return { events };
}
