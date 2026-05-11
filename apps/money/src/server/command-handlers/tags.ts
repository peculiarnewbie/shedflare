/**
 * Tag command handlers — create, delete, assign to transactions.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createTag } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";

export function handleTagCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_tag") {
    case "create_tag": {
      const valid = decodeCommand("create_tag", payload);
      const row = createTag({ name: valid.name, color: valid.color });
      events.push(eventStore.insertEvent(opId, "tag_created", { row }) as SyncServerEvent);
      break;
    }

    case "delete_tag": {
      access.exec(`DELETE FROM transaction_tags WHERE tag_id = ?`, payload.id);
      events.push(
        eventStore.insertEvent(opId, "tag_deleted", { id: payload.id }) as SyncServerEvent,
      );
      break;
    }

    case "add_transaction_tag": {
      const valid = decodeCommand("add_transaction_tag", payload);
      const existing = access.queryOne<Record<string, unknown>>(
        `SELECT 1 FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?`,
        valid.transactionId,
        valid.tagId,
      );
      if (!existing) {
        const tag = access.queryOne<{ name: string }>(
          `SELECT name FROM tags WHERE id = ?`,
          valid.tagId,
        );
        access.exec(
          `INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)`,
          valid.transactionId,
          valid.tagId,
        );
        events.push(
          eventStore.insertEvent(opId, "transaction_tag_added", {
            transactionId: valid.transactionId,
            tagId: valid.tagId,
            tagName: tag?.name ?? "",
          }) as SyncServerEvent,
        );
      }
      break;
    }

    case "remove_transaction_tag": {
      const valid = decodeCommand("remove_transaction_tag", payload);
      access.exec(
        `DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?`,
        valid.transactionId,
        valid.tagId,
      );
      events.push(
        eventStore.insertEvent(opId, "transaction_tag_removed", {
          transactionId: valid.transactionId,
          tagId: valid.tagId,
        }) as SyncServerEvent,
      );
      break;
    }
  }

  return { events };
}
