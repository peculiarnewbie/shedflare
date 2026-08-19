import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTransaction } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandInvocation } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type TransactionCommand =
  | "create_transaction"
  | "update_transaction"
  | "delete_transaction"
  | "split_transaction";

type TransactionInvocation = Extract<CommandInvocation, { commandType: TransactionCommand }>;

export async function handleTransactionCommands(
  command: TransactionInvocation,
  db: Db,
): Promise<CommandResult> {
  switch (command.commandType) {
    case "create_transaction": {
      const p = command.payload;
      const row = createTransaction(p.row);
      await db.insert(s.transactions).values(row).run();
      return { ok: true, data: { id: row.id } };
    }

    case "update_transaction": {
      const p = command.payload;
      const set: Partial<typeof s.transactions.$inferInsert> = { updatedAt: nowIso() };
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

      await db.update(s.transactions).set(set).where(eq(s.transactions.id, p.id)).run();
      return { ok: true, data: { id: p.id } };
    }

    case "delete_transaction": {
      const p = command.payload;
      // Cascade: remove split children first (no FK cascade in schema).
      await db.delete(s.transactions).where(eq(s.transactions.parentId, p.id)).run();
      await db.delete(s.transactions).where(eq(s.transactions.id, p.id)).run();
      return { ok: true, data: { id: p.id } };
    }

    case "split_transaction": {
      const p = command.payload;
      const [parent] = await db
        .select()
        .from(s.transactions)
        .where(eq(s.transactions.id, p.parentId))
        .all();
      if (!parent) return { ok: false, error: "Parent transaction not found" };
      if (parent.isChild) return { ok: false, error: "Cannot split a child transaction" };
      if (p.children.length === 0) return { ok: false, error: "Split requires at least one child" };

      const childSum = p.children.reduce((sum: number, c: { amount: number }) => sum + c.amount, 0);
      if (childSum !== parent.amount) {
        return {
          ok: false,
          error: `Split amounts (${childSum}) must equal parent amount (${parent.amount})`,
        };
      }

      await db.delete(s.transactions).where(eq(s.transactions.parentId, p.parentId)).run();
      const results: string[] = [];
      for (const child of p.children) {
        const row = createTransaction({
          ...child,
          accountId: parent.accountId,
          date: child.date ?? parent.date,
          payee: child.payee ?? parent.payee ?? undefined,
          parentId: p.parentId,
          isChild: true,
          isParent: false,
        });
        await db.insert(s.transactions).values(row).run();
        results.push(row.id);
      }

      await db
        .update(s.transactions)
        .set({
          isParent: true,
          isChild: false,
          categoryId: null,
          updatedAt: nowIso(),
        })
        .where(eq(s.transactions.id, p.parentId))
        .run();

      return { ok: true, data: { childIds: results, parentId: p.parentId } };
    }

    default:
      return { ok: false, error: "Unknown transaction command" };
  }
}
