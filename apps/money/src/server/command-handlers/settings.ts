import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { decodeCommand } from "../../domain/commands";

export function handleSettingCommands(
  opId: string,
  payload: any,
  _access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType) {
    case "update_setting": {
      const valid = decodeCommand("update_setting", payload);
      const now = new Date().toISOString();
      events.push(
        eventStore.insertEvent(opId, "settings_updated", {
          row: {
            id: valid.key,
            key: valid.key,
            value: valid.value,
            updatedAt: now,
          },
        }) as SyncServerEvent,
      );
      break;
    }
  }

  return { events };
}
