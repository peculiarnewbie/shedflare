import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createRule } from "../../domain/factories";
import { nowIso } from "../../domain/types";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function handleRuleCommands(c: string, p: any, db: Db): Promise<CR> {
  switch (c) {
    case "create_rule": {
      const r = createRule(p.rule);
      await db.insert(s.rules).values(r);
      return { ok: true, data: { id: r.id } };
    }
    case "update_rule": {
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (p.fields.stage !== undefined) set.stage = p.fields.stage;
      if (p.fields.conditionsOp !== undefined) set.conditionsOp = p.fields.conditionsOp;
      if (p.fields.conditions !== undefined) set.conditions = p.fields.conditions;
      if (p.fields.actions !== undefined) set.actions = p.fields.actions;
      if (p.fields.active !== undefined) set.active = p.fields.active;
      await db.update(s.rules).set(set).where(eq(s.rules.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    case "delete_rule": {
      await db
        .update(s.rules)
        .set({ deleted: true, updatedAt: nowIso() })
        .where(eq(s.rules.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    default:
      return { ok: false, error: `Unknown rule command: ${c}` };
  }
}
