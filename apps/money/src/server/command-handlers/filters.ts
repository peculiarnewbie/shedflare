import type { DataAccess } from "../data-access";
import { createTransactionFilter } from "../../domain/factories";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export function handleFilterCommands(c: string, p: any, a: DataAccess): CR {
  switch (c) {
    case "create_filter": {
      const r = createTransactionFilter(p.filter);
      a.exec("INSERT INTO transaction_filters (id, name, conditions, conditions_op, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        r.id, r.name, r.conditions, r.conditionsOp, r.createdAt, r.updatedAt);
      return { ok: true, data: { id: r.id } };
    }
    case "update_filter": {
      const now = new Date().toISOString();
      const fs: string[] = ["updated_at = ?"], ps: unknown[] = [now];
      if (p.fields.name !== undefined) { fs.push("name = ?"); ps.push(p.fields.name); }
      if (p.fields.conditions !== undefined) { fs.push("conditions = ?"); ps.push(p.fields.conditions); }
      if (p.fields.conditionsOp !== undefined) { fs.push("conditions_op = ?"); ps.push(p.fields.conditionsOp); }
      ps.push(p.id);
      a.exec(`UPDATE transaction_filters SET ${fs.join(", ")} WHERE id = ?`, ...ps);
      return { ok: true, data: { id: p.id } };
    }
    case "delete_filter": {
      a.exec("DELETE FROM transaction_filters WHERE id = ?", p.id);
      return { ok: true, data: { id: p.id } };
    }
    default: return { ok: false, error: `Unknown filter command: ${c}` };
  }
}
