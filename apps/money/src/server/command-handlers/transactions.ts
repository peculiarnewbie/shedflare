import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTransaction } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type TransactionCommand =
  | "create_transaction"
  | "update_transaction"
  | "delete_transaction"
  | "split_transaction";

export async function handleTransactionCommands(
  commandType: TransactionCommand,
  payload: CommandPayloadMap[TransactionCommand],
  db: Db,
): Promise<CommandResult> {
  switch (commandType) {
    case "create_transaction": {
      const p = payload as CommandPayloadMap["create_transaction"];
      const row = createTransaction(p.row);
      await db.insert(s.transactions).values(row);
      return { ok: true, data: { id: row.id } };
    }

    case "update_transaction": {
      const p = payload as CommandPayloadMap["update_transaction"];
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      const f = p.fields;
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

      await db.update(s.transactions).set(set).where(eq(s.transactions.id, p.id));
      return { ok: true, data: { id: p.id } };
    }

    case "delete_transaction": {
      const p = payload as CommandPayloadMap["delete_transaction"];
      await db.delete(s.transactions).where(eq(s.transactions.id, p.id));
      return { ok: true, data: { id: p.id } };
    }

    case "split_transaction": {
      const p = payload as CommandPayloadMap["split_transaction"];
      await db.delete(s.transactions).where(eq(s.transactions.parentId, p.parentId));
      const results: string[] = [];
      for (const child of p.children) {
        const row = createTransaction({
          ...child,
          parentId: p.parentId,
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
