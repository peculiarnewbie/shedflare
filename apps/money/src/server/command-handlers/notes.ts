import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createNote } from "../../domain/factories";
import { nowIso } from "../../domain/types";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function handleNotesCommands(c: string, p: any, db: Db): Promise<CR> {
  switch (c) {
    case "create_note": {
      const r = createNote(p);
      await db.insert(s.notes).values(r);
      return { ok: true, data: { id: r.id } };
    }
    case "update_note": {
      await db
        .update(s.notes)
        .set({ body: p.body, updatedAt: nowIso() })
        .where(eq(s.notes.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    case "delete_note": {
      await db.delete(s.notes).where(eq(s.notes.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    case "list_notes": {
      const rows = await db
        .select()
        .from(s.notes)
        .where(eq(s.notes.noteableType, p.noteableType))
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
