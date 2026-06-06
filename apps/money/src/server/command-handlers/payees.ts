import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createPayee } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type PayeeCommand = "create_payee" | "update_payee" | "merge_payees";

export async function handlePayeeCommands(
  c: PayeeCommand,
  p: CommandPayloadMap[PayeeCommand],
  db: Db,
): Promise<CommandResult> {
  switch (c) {
    case "create_payee": {
      const pp = p as CommandPayloadMap["create_payee"];
      const row = createPayee(pp);
      await db.insert(s.payees).values(row);
      return { ok: true, data: { id: row.id } };
    }
    case "update_payee": {
      const pp = p as CommandPayloadMap["update_payee"];
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (pp.name !== undefined) set.name = pp.name;
      if (pp.favorite !== undefined) set.favorite = pp.favorite;
      await db.update(s.payees).set(set).where(eq(s.payees.id, pp.id));
      return { ok: true, data: { id: pp.id } };
    }
    case "merge_payees": {
      const pp = p as CommandPayloadMap["merge_payees"];
      for (const sourceId of pp.sourceIds) {
        await db
          .update(s.transactions)
          .set({ payee: pp.targetId })
          .where(eq(s.transactions.payee, sourceId));
        await db.delete(s.payees).where(eq(s.payees.id, sourceId));
      }
      return { ok: true, data: { targetId: pp.targetId } };
    }
    default:
      return { ok: false, error: `Unknown payee command: ${c}` };
  }
}
