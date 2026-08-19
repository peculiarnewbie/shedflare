import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTransactionFilter } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandInvocation } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type FilterCommand = "create_filter" | "update_filter" | "delete_filter";

type FilterInvocation = Extract<CommandInvocation, { commandType: FilterCommand }>;
export async function handleFilterCommands(
  command: FilterInvocation,
  db: Db,
): Promise<CommandResult> {
  switch (command.commandType) {
    case "create_filter": {
      const pp = command.payload;
      const r = createTransactionFilter(pp.filter);
      await db.insert(s.transactionFilters).values(r).run();
      return { ok: true, data: { id: r.id } };
    }
    case "update_filter": {
      const pp = command.payload;
      const set: Partial<typeof s.transactionFilters.$inferInsert> = { updatedAt: nowIso() };
      if (pp.fields.name !== undefined) set.name = pp.fields.name;
      if (pp.fields.conditions !== undefined) set.conditions = pp.fields.conditions;
      if (pp.fields.conditionsOp !== undefined) set.conditionsOp = pp.fields.conditionsOp;
      await db
        .update(s.transactionFilters)
        .set(set)
        .where(eq(s.transactionFilters.id, pp.id))
        .run();
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_filter": {
      const pp = command.payload;
      await db.delete(s.transactionFilters).where(eq(s.transactionFilters.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    default:
      return { ok: false, error: "Unknown filter command" };
  }
}
