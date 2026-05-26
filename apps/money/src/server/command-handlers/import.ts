import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createTransaction } from "../../domain/factories";
import { nowIso } from "../../domain/types";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export async function handleImportCommands(c: string, p: any, db: Db): Promise<CR> {
  if (c !== "import_transactions") return { ok: true, data: { added: 0, updated: 0, errors: [] } };

  const txs = p.transactions ?? [];
  if (!p.accountId || txs.length === 0)
    return { ok: true, data: { added: 0, updated: 0, errors: [] } };

  const now = nowIso();
  let added = 0,
    updated = 0;
  const errors: string[] = [];

  for (const tx of txs) {
    try {
      const row = createTransaction({ ...tx, accountId: p.accountId });
      if (row.importedDescription) {
        const [existing] = await db
          .select({ id: s.transactions.id })
          .from(s.transactions)
          .where(eq(s.transactions.importedDescription, row.importedDescription))
          .all();
        if (existing) {
          await db
            .update(s.transactions)
            .set({
              amount: row.amount,
              payee: row.payee,
              notes: row.notes,
              date: row.date,
              categoryId: row.categoryId,
              updatedAt: now,
            })
            .where(eq(s.transactions.id, existing.id));
          updated++;
          continue;
        }
      }
      await db.insert(s.transactions).values(row);
      added++;
    } catch (e) {
      errors.push(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  return { ok: true, data: { added, updated, errors } };
}
