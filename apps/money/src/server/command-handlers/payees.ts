/**
 * Payee command handlers — create, update, merge.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createPayee } from "../../domain/factories";

export function handlePayeeCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_payee") {
    case "create_payee": {
      const row = createPayee({ name: payload.name });
      events.push(eventStore.insertEvent(opId, "payee_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_payee": {
      const existing = access.getPayee(payload.id);
      if (existing) {
        const updated = {
          ...existing,
          name: payload.name ?? existing.name,
          favorite: payload.favorite ?? existing.favorite,
          updatedAt: new Date().toISOString(),
        };
        events.push(eventStore.insertEvent(opId, "payee_updated", { row: updated }) as SyncServerEvent);
      }
      break;
    }

    case "merge_payees": {
      const target = access.getPayee(payload.targetId);
      if (target) {
        // Update all transactions referencing source payee names to target name
        for (const sourceId of (payload.sourceIds as string[]) ?? []) {
          const source = access.getPayee(sourceId);
          if (source) {
            // Update transactions that have this payee name
            access.exec(
              `UPDATE transactions SET payee = ? WHERE payee = ?`,
              target.name, source.name,
            );
          }
        }
        events.push(eventStore.insertEvent(opId, "payees_merged", {
          targetId: payload.targetId,
          sourceIds: payload.sourceIds,
        }) as SyncServerEvent);
      }
      break;
    }
  }

  return { events };
}
