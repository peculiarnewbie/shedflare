import type { DataAccess } from "../data-access";
import { createTag } from "../../domain/factories";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export function handleTagCommands(c: string, p: any, a: DataAccess): CR {
  switch (c) {
    case "create_tag": {
      const r = createTag(p);
      a.exec(
        "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)",
        r.id,
        r.name,
        r.color,
        r.createdAt,
      );
      return { ok: true, data: { id: r.id } };
    }
    case "delete_tag": {
      a.exec("DELETE FROM transaction_tags WHERE tag_id = ?", p.id);
      a.exec("DELETE FROM tags WHERE id = ?", p.id);
      return { ok: true, data: { id: p.id } };
    }
    case "add_transaction_tag": {
      a.exec(
        "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)",
        p.transactionId,
        p.tagId,
      );
      return { ok: true, data: { transactionId: p.transactionId, tagId: p.tagId } };
    }
    case "remove_transaction_tag": {
      a.exec(
        "DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?",
        p.transactionId,
        p.tagId,
      );
      return { ok: true, data: { transactionId: p.transactionId, tagId: p.tagId } };
    }
    default:
      return { ok: false, error: `Unknown tag command: ${c}` };
  }
}
