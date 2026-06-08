import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTransactionFilter } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type FilterCommand = "create_filter" | "update_filter" | "delete_filter";

export async function handleFilterCommands(
  c: FilterCommand,
  p: CommandPayloadMap[FilterCommand],
  db: Db,
): Promise<CommandResult> {
  switch (c) {
    case "create_filter": {
      const pp = p as CommandPayloadMap["create_filter"];
      const r = createTransactionFilter(pp.filter);
      await db.insert(s.transactionFilters).values(r);
      return { ok: true, data: { id: r.id } };
    }
    case "update_filter": {
      const pp = p as CommandPayloadMap["update_filter"];
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (pp.fields.name !== undefined) set.name = pp.fields.name;
      if (pp.fields.conditions !== undefined) set.conditions = pp.fields.conditions;
      if (pp.fields.conditionsOp !== undefined) set.conditionsOp = pp.fields.conditionsOp;
      await db.update(s.transactionFilters).set(set).where(eq(s.transactionFilters.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_filter": {
      const pp = p as CommandPayloadMap["delete_filter"];
      await db.delete(s.transactionFilters).where(eq(s.transactionFilters.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    default:
      return { ok: false, error: "Unknown filter command: " + String(c) };
  }
}
