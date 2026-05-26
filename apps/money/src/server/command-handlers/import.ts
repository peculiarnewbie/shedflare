import type { DataAccess } from "../data-access";
import { createTransaction } from "../../domain/factories";

type CR = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

export function handleImportCommands(c: string, p: any, a: DataAccess): CR {
  if (c !== "import_transactions") return { ok: true, data: { added: 0, updated: 0, errors: [] } };

  const txs = p.transactions ?? [];
  if (!p.accountId || txs.length === 0)
    return { ok: true, data: { added: 0, updated: 0, errors: [] } };

  const now = new Date().toISOString();
  let added = 0,
    updated = 0;
  const errors: string[] = [];

  for (const tx of txs) {
    try {
      const row = createTransaction({ ...tx, accountId: p.accountId });
      // Try to find existing by imported_description
      if (row.importedDescription) {
        const existing = a.queryOne<{ id: string }>(
          "SELECT id FROM transactions WHERE imported_description = ?",
          row.importedDescription,
        );
        if (existing) {
          a.exec(
            "UPDATE transactions SET amount = ?, payee = ?, notes = ?, date = ?, category_id = ?, updated_at = ? WHERE id = ?",
            row.amount,
            row.payee,
            row.notes,
            row.date,
            row.categoryId,
            now,
            existing.id,
          );
          updated++;
          continue;
        }
      }
      a.exec(
        `INSERT INTO transactions (id, account_id, category_id, amount, payee, notes, date, cleared, imported_description, starting_balance_flag, sort_order, is_parent, is_child, parent_id, transfer_id, schedule_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.accountId,
        row.categoryId,
        row.amount,
        row.payee,
        row.notes,
        row.date,
        row.cleared ? 1 : 0,
        row.importedDescription,
        row.startingBalanceFlag ? 1 : 0,
        row.sortOrder,
        row.isParent ? 1 : 0,
        row.isChild ? 1 : 0,
        row.parentId,
        row.transferId,
        row.scheduleId,
        row.createdAt,
        row.updatedAt,
      );
      added++;
    } catch (e) {
      errors.push(`Failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  return { ok: true, data: { added, updated, errors } };
}
