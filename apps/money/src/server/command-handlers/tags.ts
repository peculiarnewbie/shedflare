/**
 * Tag command handlers — create, delete.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createTag } from "../../domain/factories";

export function handleTagCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_tag") {
    case "create_tag": {
      const row = createTag({ name: payload.name, color: payload.color });
      events.push(eventStore.insertEvent(opId, "tag_created", { row }) as SyncServerEvent);
      break;
    }

    case "delete_tag": {
      access.exec(`DELETE FROM transaction_tags WHERE tag_id = ?`, payload.id);
      events.push(eventStore.insertEvent(opId, "tag_deleted", { id: payload.id }) as SyncServerEvent);
      break;
    }
  }

  return { events };
}
