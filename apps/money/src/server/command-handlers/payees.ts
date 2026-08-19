import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createPayee } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandInvocation } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type PayeeCommand = "create_payee" | "update_payee" | "delete_payee" | "merge_payees";

type PayeeInvocation = Extract<CommandInvocation, { commandType: PayeeCommand }>;

export async function handlePayeeCommands(
  command: PayeeInvocation,
  db: Db,
): Promise<CommandResult> {
  switch (command.commandType) {
    case "create_payee": {
      const pp = command.payload;
      const row = createPayee(pp);
      await db.insert(s.payees).values(row).run();
      return { ok: true, data: { id: row.id } };
    }
    case "update_payee": {
      const pp = command.payload;
      const set: Partial<typeof s.payees.$inferInsert> = { updatedAt: nowIso() };
      if (pp.name !== undefined) set.name = pp.name;
      if (pp.favorite !== undefined) set.favorite = pp.favorite;
      await db.update(s.payees).set(set).where(eq(s.payees.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    case "delete_payee": {
      const pp = command.payload;
      await db.delete(s.payees).where(eq(s.payees.id, pp.id)).run();
      return { ok: true, data: { id: pp.id } };
    }
    case "merge_payees": {
      const pp = command.payload;
      const [target] = await db
        .select({ name: s.payees.name })
        .from(s.payees)
        .where(eq(s.payees.id, pp.targetId))
        .all();
      if (!target) return { ok: false, error: "Target payee not found" };

      for (const sourceId of pp.sourceIds) {
        if (sourceId === pp.targetId) continue;
        const [source] = await db
          .select({ name: s.payees.name })
          .from(s.payees)
          .where(eq(s.payees.id, sourceId))
          .all();
        if (!source) continue;
        await db
          .update(s.transactions)
          .set({ payee: target.name })
          .where(eq(s.transactions.payee, source.name))
          .run();
        await db
          .update(s.schedules)
          .set({ payeeId: pp.targetId, updatedAt: nowIso() })
          .where(eq(s.schedules.payeeId, sourceId))
          .run();
        await db.delete(s.payees).where(eq(s.payees.id, sourceId)).run();
      }
      return { ok: true, data: { targetId: pp.targetId } };
    }
    default:
      return { ok: false, error: "Unknown payee command" };
  }
}
