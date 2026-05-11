/**
 * Payee command handlers — create, update, merge.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createPayee } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";
import { castId, type PayeeId } from "../../domain/types";

export function handlePayeeCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_payee") {
    case "create_payee": {
      const valid = decodeCommand("create_payee", payload);
      const row = createPayee({ name: valid.name });
      events.push(eventStore.insertEvent(opId, "payee_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_payee": {
      const valid = decodeCommand("update_payee", payload);
      const existing = access.getPayee(castId<PayeeId>(valid.id));
      if (existing) {
        const updated = {
          ...existing,
          name: valid.name ?? existing.name,
          favorite: valid.favorite ?? existing.favorite,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "payee_updated", { row: updated }) as SyncServerEvent,
        );
      }
      break;
    }

    case "merge_payees": {
      const valid = decodeCommand("merge_payees", payload);
      const target = access.getPayee(castId<PayeeId>(valid.targetId));
      if (target) {
        for (const sourceId of valid.sourceIds) {
          const source = access.getPayee(castId<PayeeId>(sourceId));
          if (source) {
            access.exec(
              `UPDATE transactions SET payee = ? WHERE payee = ?`,
              target.name,
              source.name,
            );
          }
        }
        events.push(
          eventStore.insertEvent(opId, "payees_merged", {
            targetId: valid.targetId,
            sourceIds: valid.sourceIds,
          }) as SyncServerEvent,
        );
      }
      break;
    }
  }

  return { events };
}
