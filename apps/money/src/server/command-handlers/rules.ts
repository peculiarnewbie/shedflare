import type { DataAccess } from "../data-access";
import { createRule } from "../../domain/factories";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export function handleRuleCommands(c: string, p: any, a: DataAccess): CR {
  switch (c) {
    case "create_rule": {
      const r = createRule(p.rule);
      a.exec(
        `INSERT INTO rules (id, stage, conditions_op, conditions, actions, active, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        r.id,
        r.stage,
        r.conditionsOp,
        r.conditions,
        r.actions,
        r.active ? 1 : 0,
        r.createdAt,
        r.updatedAt,
      );
      return { ok: true, data: { id: r.id } };
    }
    case "update_rule": {
      const now = new Date().toISOString();
      const fs: string[] = ["updated_at = ?"];
      const ps: unknown[] = [now];
      if (p.fields.stage !== undefined) {
        fs.push("stage = ?");
        ps.push(p.fields.stage);
      }
      if (p.fields.conditionsOp !== undefined) {
        fs.push("conditions_op = ?");
        ps.push(p.fields.conditionsOp);
      }
      if (p.fields.conditions !== undefined) {
        fs.push("conditions = ?");
        ps.push(p.fields.conditions);
      }
      if (p.fields.actions !== undefined) {
        fs.push("actions = ?");
        ps.push(p.fields.actions);
      }
      if (p.fields.active !== undefined) {
        fs.push("active = ?");
        ps.push(p.fields.active ? 1 : 0);
      }
      ps.push(p.id);
      a.exec(`UPDATE rules SET ${fs.join(", ")} WHERE id = ?`, ...ps);
      return { ok: true, data: { id: p.id } };
    }
    case "delete_rule": {
      a.exec(
        "UPDATE rules SET deleted = 1, updated_at = ? WHERE id = ?",
        new Date().toISOString(),
        p.id,
      );
      return { ok: true, data: { id: p.id } };
    }
    default:
      return { ok: false, error: `Unknown rule command: ${c}` };
  }
}
