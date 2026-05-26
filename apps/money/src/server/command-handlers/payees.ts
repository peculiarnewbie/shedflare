import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createPayee } from "../../domain/factories";
import { nowIso } from "../../domain/types";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function handlePayeeCommands(c: string, p: any, db: Db): Promise<CR> {
  switch (c) {
    case "create_payee": {
      const row = createPayee(p);
      await db.insert(s.payees).values(row);
      return { ok: true, data: { id: row.id } };
    }
    case "update_payee": {
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (p.name !== undefined) set.name = p.name;
      if (p.favorite !== undefined) set.favorite = p.favorite;
      await db.update(s.payees).set(set).where(eq(s.payees.id, p.id));
      return { ok: true, data: { id: p.id } };
    }
    case "merge_payees": {
      for (const sourceId of p.sourceIds) {
        await db
          .update(s.transactions)
          .set({ payee: p.targetId })
          .where(eq(s.transactions.payee, sourceId));
        await db.delete(s.payees).where(eq(s.payees.id, sourceId));
      }
      return { ok: true, data: { targetId: p.targetId } };
    }
    default:
      return { ok: false, error: `Unknown payee command: ${c}` };
  }
}
