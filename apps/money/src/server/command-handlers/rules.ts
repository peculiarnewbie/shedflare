import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createRule } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandInvocation } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type RuleCommand = "create_rule" | "update_rule" | "delete_rule";

type RuleInvocation = Extract<CommandInvocation, { commandType: RuleCommand }>;
export async function handleRuleCommands(command: RuleInvocation, db: Db): Promise<CommandResult> {
  switch (command.commandType) {
    case "create_rule": {
      const pp = command.payload;
      const r = createRule(pp.rule);
      await db.insert(s.rules).values(r).run();
      return { ok: true, data: { id: r.id } };
    }
    case "update_rule": {
      const pp = command.payload;
      const set: Partial<typeof s.rules.$inferInsert> = { updatedAt: nowIso() };
      if (pp.fields.stage !== undefined) set.stage = pp.fields.stage;
      if (pp.fields.conditionsOp !== undefined) set.conditionsOp = pp.fields.conditionsOp;
      if (pp.fields.conditions !== undefined) set.conditions = pp.fields.conditions;
      if (pp.fields.actions !== undefined) set.actions = pp.fields.actions;
      if (pp.fields.active !== undefined) set.active = pp.fields.active;
      await db.update(s.rules).set(set).where(eq(s.rules.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_rule": {
      const pp = command.payload;
      await db
        .update(s.rules)
        .set({ deleted: true, updatedAt: nowIso() })
        .where(eq(s.rules.id, pp.id))
        .run();
      return { ok: true, data: { id: pp.id } };
    }
    default:
      return { ok: false, error: "Unknown rule command" };
  }
}
