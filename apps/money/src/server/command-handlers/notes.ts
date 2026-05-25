/**
 * Notes command handlers — CRUD for notes on noteable entities.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import type { Note } from "../schema";
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
      const _noteableType = valid.noteableType as Note["noteableType"];

      if (!valid.noteableType || !valid.noteableId || !valid.body) {
        throw new Error("Noteable type, ID, and body are required");
      }

      const row = createNote({
        noteableType: valid.noteableType,
        noteableId: valid.noteableId,
        body: valid.body,
      });

      events.push(
        eventStore.insertEvent(opId, "note_created", {
          row: row as Note,
          noteableType: valid.noteableType,
          noteableId: valid.noteableId,
        }) as SyncServerEvent,
      );
      break;
    }

    case "delete_note": {
      const valid = decodeCommand("delete_note", payload);
      const _noteableType = valid.noteableType as Note["noteableType"];

      if (!valid.noteableType || !valid.noteableId) {
        throw new Error("Noteable type and ID are required");
      }

      access.exec(
        `DELETE FROM notes WHERE noteable_type = ? AND noteable_id = ?`,
        valid.noteableType,
        valid.noteableId,
      );

      events.push(
        eventStore.insertEvent(opId, "note_deleted", {
          noteableType: valid.noteableType,
          noteableId: valid.noteableId,
        }) as SyncServerEvent,
      );
      break;
    }

    case "update_note": {
      const valid = decodeCommand("update_note", payload);
      const _noteableType = valid.noteableType as Note["noteableType"];

      if (!valid.noteableType || !valid.noteableId || !valid.body) {
        throw new Error("Noteable type, ID, and body are required");
      }

      const existing = access.queryOne<Note>(
        `SELECT * FROM notes WHERE noteable_type = ? AND noteable_id = ?`,
        valid.noteableType,
        valid.noteableId,
      );

      if (!existing) {
        // Create new note
        const row = createNote({
          noteableType: valid.noteableType,
          noteableId: valid.noteableId,
          body: valid.body,
        });
        access.exec(
          `INSERT INTO notes (id, noteable_type, noteable_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
          row.id,
          row.noteableType,
          row.noteableId,
          row.body,
          new Date().toISOString(),
          new Date().toISOString(),
        );
        events.push(
          eventStore.insertEvent(opId, "note_created", {
            row: row as Note,
            noteableType: valid.noteableType,
            noteableId: valid.noteableId,
          }) as SyncServerEvent,
        );
      } else {
        // Update existing note
        const row = updateNote(existing, valid.body);
        access.exec(
          `UPDATE notes SET body = ?, updated_at = ? WHERE noteable_type = ? AND noteable_id = ?`,
          row.body,
          new Date().toISOString(),
          row.noteableType,
          row.noteableId,
        );
        events.push(
          eventStore.insertEvent(opId, "note_updated", {
            noteableType: valid.noteableType,
            noteableId: valid.noteableId,
          }) as SyncServerEvent,
        );
      }
      break;
    }

    case "list_notes": {
      const valid = decodeCommand("list_notes", payload);
      const _noteableType = valid.noteableType as Note["noteableType"];

      if (!valid.noteableType) {
        throw new Error("Noteable type is required");
      }

      const notes = access.queryAll<Note>(
        `SELECT * FROM notes WHERE noteable_type = ? ORDER BY created_at DESC`,
        valid.noteableType,
      );

      events.push(
        eventStore.insertEvent(opId, "notes_listed", {
          noteableType: valid.noteableType,
          notes: notes as Note[],
        }) as SyncServerEvent,
      );
      break;
    }
  }

  return { events };
}
