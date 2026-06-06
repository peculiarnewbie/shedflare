import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createNote } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type NoteCommand = "create_note" | "update_note" | "delete_note" | "list_notes";

export async function handleNotesCommands(
  c: NoteCommand,
  p: CommandPayloadMap[NoteCommand],
  db: Db,
): Promise<CommandResult> {
  switch (c) {
    case "create_note": {
      const pp = p as CommandPayloadMap["create_note"];
      const r = createNote(pp);
      await db.insert(s.notes).values(r);
      return { ok: true, data: { id: r.id } };
    }
    case "update_note": {
      const pp = p as CommandPayloadMap["update_note"];
      await db
        .update(s.notes)
        .set({ body: pp.body, updatedAt: nowIso() })
        .where(eq(s.notes.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_note": {
      const pp = p as CommandPayloadMap["delete_note"];
      await db.delete(s.notes).where(eq(s.notes.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "list_notes": {
      const pp = p as CommandPayloadMap["list_notes"];
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
      return { ok: false, error: `Unknown note command: ${c}` };
  }
}
