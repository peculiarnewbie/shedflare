import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createRule } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type RuleCommand = "create_rule" | "update_rule" | "delete_rule";

export async function handleRuleCommands(
  c: RuleCommand,
  p: CommandPayloadMap[RuleCommand],
  db: Db,
): Promise<CommandResult> {
  switch (c) {
    case "create_rule": {
      const pp = p as CommandPayloadMap["create_rule"];
      const r = createRule(pp.rule);
      await db.insert(s.rules).values(r);
      return { ok: true, data: { id: r.id } };
    }
    case "update_rule": {
      const pp = p as CommandPayloadMap["update_rule"];
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (pp.fields.stage !== undefined) set.stage = pp.fields.stage;
      if (pp.fields.conditionsOp !== undefined) set.conditionsOp = pp.fields.conditionsOp;
      if (pp.fields.conditions !== undefined) set.conditions = pp.fields.conditions;
      if (pp.fields.actions !== undefined) set.actions = pp.fields.actions;
      if (pp.fields.active !== undefined) set.active = pp.fields.active;
      await db.update(s.rules).set(set).where(eq(s.rules.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_rule": {
      const pp = p as CommandPayloadMap["delete_rule"];
      await db
        .update(s.rules)
        .set({ deleted: true, updatedAt: nowIso() })
        .where(eq(s.rules.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    default:
      return { ok: false, error: `Unknown rule command: ${c}` };
  }
}
