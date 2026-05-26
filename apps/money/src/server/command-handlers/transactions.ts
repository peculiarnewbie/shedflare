import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTransaction } from "../../domain/factories";
import { nowIso } from "../../domain/types";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export async function handleTransactionCommands(
  commandType: string,
  payload: any,
  db: Db,
): Promise<CommandResult> {
  switch (commandType) {
    case "create_transaction": {
      const row = createTransaction(payload.row);
      await db.insert(s.transactions).values(row);
      return { ok: true, data: { id: row.id } };
    }

    case "update_transaction": {
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      const f = payload.fields;
      if (f.accountId !== undefined) set.accountId = f.accountId;
      if (f.categoryId !== undefined) set.categoryId = f.categoryId;
      if (f.amount !== undefined) set.amount = f.amount;
      if (f.payee !== undefined) set.payee = f.payee;
      if (f.notes !== undefined) set.notes = f.notes;
      if (f.date !== undefined) set.date = f.date;
      if (f.cleared !== undefined) set.cleared = f.cleared;
      if (f.reconciled !== undefined) set.reconciled = f.reconciled;
      if (f.importedDescription !== undefined) set.importedDescription = f.importedDescription;
      if (f.sortOrder !== undefined) set.sortOrder = f.sortOrder;

      await db.update(s.transactions).set(set).where(eq(s.transactions.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    case "delete_transaction": {
      await db.delete(s.transactions).where(eq(s.transactions.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    case "split_transaction": {
      await db.delete(s.transactions).where(eq(s.transactions.parentId, payload.parentId));
      const results: string[] = [];
      for (const child of payload.children) {
        const row = createTransaction({
          ...child,
          parentId: payload.parentId,
          isChild: true,
        });
        await db.insert(s.transactions).values(row);
        results.push(row.id);
      }
      return { ok: true, data: { childIds: results } };
    }

    default:
      return { ok: false, error: `Unknown transaction command: ${commandType}` };
  }
}
