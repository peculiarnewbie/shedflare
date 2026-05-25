import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import type { Note } from "../../db/schema";
import { decodeCommand } from "../../domain/commands";
import { createNote, updateNote } from "../../domain/factories";

export function handleNotesCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_note") {
    case "create_note": {
      const valid = decodeCommand("create_note", payload);
      const row = createNote({
        noteableType: valid.noteableType as Note["noteableType"],
        noteableId: valid.noteableId,
        body: valid.body,
      });
      events.push(
        eventStore.insertEvent(opId, "note_created", { row: row as Note }) as SyncServerEvent,
      );
      break;
    }

    case "update_note": {
      const valid = decodeCommand("update_note", payload);
      const existing = access.queryOne<Note>(
        `SELECT * FROM notes WHERE noteable_type = ? AND noteable_id = ?`,
        valid.noteableType,
        valid.noteableId,
      );

      if (!existing) {
        const row = createNote({
          noteableType: valid.noteableType as Note["noteableType"],
          noteableId: valid.noteableId,
          body: valid.body,
        });
        events.push(
          eventStore.insertEvent(opId, "note_created", { row: row as Note }) as SyncServerEvent,
        );
      } else {
        const row = updateNote(existing, valid.body);
        access.exec(
          `UPDATE notes SET body = ?, updated_at = ? WHERE id = ?`,
          row.body,
          row.updatedAt,
          row.id,
        );
        events.push(
          eventStore.insertEvent(opId, "note_updated", { row: row as Note }) as SyncServerEvent,
        );
      }
      break;
    }

    case "delete_note": {
      const valid = decodeCommand("delete_note", payload);
      const existing = access.queryOne<Note>(
        `SELECT * FROM notes WHERE noteable_type = ? AND noteable_id = ?`,
        valid.noteableType,
        valid.noteableId,
      );
      if (!existing) break;
      access.exec(`DELETE FROM notes WHERE id = ?`, existing.id);
      events.push(
        eventStore.insertEvent(opId, "note_deleted", {
          id: existing.id,
          noteableType: valid.noteableType,
          noteableId: valid.noteableId,
        }) as SyncServerEvent,
      );
      break;
    }

    case "list_notes": {
      const valid = decodeCommand("list_notes", payload);
      const noteRows = access.queryAll<Note>(
        `SELECT * FROM notes WHERE noteable_type = ? ORDER BY created_at DESC`,
        valid.noteableType,
      );
      events.push(
        eventStore.insertEvent(opId, "notes_listed", {
          noteableType: valid.noteableType,
          notes: noteRows,
        }) as SyncServerEvent,
      );
      break;
    }
  }

  return { events };
}
