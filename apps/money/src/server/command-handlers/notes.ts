import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createNote } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandInvocation } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type NoteCommand = "create_note" | "update_note" | "delete_note" | "list_notes";

type NoteInvocation = Extract<CommandInvocation, { commandType: NoteCommand }>;
export async function handleNotesCommands(command: NoteInvocation, db: Db): Promise<CommandResult> {
  switch (command.commandType) {
    case "create_note": {
      const pp = command.payload;
      const r = createNote(pp);
      await db.insert(s.notes).values(r).run();
      return { ok: true, data: { id: r.id } };
    }
    case "update_note": {
      const pp = command.payload;
      await db
        .update(s.notes)
        .set({ body: pp.body, updatedAt: nowIso() })
        .where(eq(s.notes.id, pp.id))
        .run();
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_note": {
      const pp = command.payload;
      await db.delete(s.notes).where(eq(s.notes.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    case "list_notes": {
      const pp = command.payload;
      const rows = await db
        .select()
        .from(s.notes)
        .where(eq(s.notes.noteableType, pp.noteableType))
        .all();
      return {
        ok: true,
        data: {
          notes: rows.map((n) => ({
            noteableType: n.noteableType,
            noteableId: n.noteableId,
            id: n.id,
            body: n.body,
          })),
        },
      };
    }
    default:
      return { ok: false, error: "Unknown note command" };
  }
}
