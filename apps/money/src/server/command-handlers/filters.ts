import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTransactionFilter } from "../../domain/factories";
import { nowIso } from "../../domain/types";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function handleFilterCommands(c: string, p: any, db: Db): Promise<CR> {
  switch (c) {
    case "create_filter": {
      const r = createTransactionFilter(p.filter);
      await db.insert(s.transactionFilters).values(r);
      return { ok: true, data: { id: r.id } };
    }
    case "update_filter": {
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (p.fields.name !== undefined) set.name = p.fields.name;
      if (p.fields.conditions !== undefined) set.conditions = p.fields.conditions;
      if (p.fields.conditionsOp !== undefined) set.conditionsOp = p.fields.conditionsOp;
      await db.update(s.transactionFilters).set(set).where(eq(s.transactionFilters.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    case "delete_filter": {
      await db.delete(s.transactionFilters).where(eq(s.transactionFilters.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    default:
      return { ok: false, error: `Unknown filter command: ${c}` };
  }
}
