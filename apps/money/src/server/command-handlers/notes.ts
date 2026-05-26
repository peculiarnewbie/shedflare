import type { DataAccess } from "../data-access";
import { createNote } from "../../domain/factories";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export function handleNotesCommands(c: string, p: any, a: DataAccess): CR {
  switch (c) {
    case "create_note": {
      const r = createNote(p);
      a.exec("INSERT INTO notes (id, noteable_type, noteable_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        r.id, r.noteableType, r.noteableId, r.body, r.createdAt, r.updatedAt);
      return { ok: true, data: { id: r.id } };
    }
    case "update_note": {
      a.exec("UPDATE notes SET body = ?, updated_at = ? WHERE id = ?", p.body, new Date().toISOString(), p.id);
      return { ok: true, data: { id: p.id } };
    }
    case "delete_note": {
      a.exec("DELETE FROM notes WHERE id = ?", p.id);
      return { ok: true, data: { id: p.id } };
    }
    case "list_notes": {
      const rows = a.queryAll<Record<string, unknown>>("SELECT * FROM notes WHERE noteable_type = ?", p.noteableType);
      return { ok: true, data: { notes: rows.map(n => ({
        noteableType: n.noteable_type, noteableId: n.noteable_id, id: n.id, body: n.body,
      })) } };
    }
    default: return { ok: false, error: `Unknown note command: ${c}` };
  }
}
