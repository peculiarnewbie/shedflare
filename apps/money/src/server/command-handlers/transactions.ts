import type { DataAccess } from "../data-access";
import { createTransaction } from "../../domain/factories";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export function handleTransactionCommands(
  commandType: string,
  payload: any,
  access: DataAccess,
): CommandResult {
  switch (commandType) {
    case "create_transaction": {
      const row = createTransaction(payload.row);
      access.exec(
        `INSERT INTO transactions (id, account_id, category_id, amount, payee, notes, date, cleared, imported_description, starting_balance_flag, sort_order, is_parent, is_child, parent_id, transfer_id, schedule_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id, row.accountId, row.categoryId, row.amount, row.payee, row.notes,
        row.date, row.cleared ? 1 : 0, row.importedDescription, row.startingBalanceFlag ? 1 : 0,
        row.sortOrder, row.isParent ? 1 : 0, row.isChild ? 1 : 0, row.parentId,
        row.transferId, row.scheduleId, row.createdAt, row.updatedAt,
      );
      return { ok: true, data: { id: row.id } };
    }

    case "update_transaction": {
      const now = new Date().toISOString();
      const fields: string[] = ["updated_at = ?"];
      const params: unknown[] = [now];
      const f = payload.fields;
      if (f.accountId) { fields.push("account_id = ?"); params.push(f.accountId); }
      if (f.categoryId !== undefined) { fields.push("category_id = ?"); params.push(f.categoryId); }
      if (f.amount !== undefined) { fields.push("amount = ?"); params.push(f.amount); }
      if (f.payee !== undefined) { fields.push("payee = ?"); params.push(f.payee); }
      if (f.notes !== undefined) { fields.push("notes = ?"); params.push(f.notes); }
      if (f.date) { fields.push("date = ?"); params.push(f.date); }
      if (f.cleared !== undefined) { fields.push("cleared = ?"); params.push(f.cleared ? 1 : 0); }

      params.push(payload.id);
      access.exec(`UPDATE transactions SET ${fields.join(", ")} WHERE id = ?`, ...params);
      return { ok: true, data: { id: payload.id } };
    }

    case "delete_transaction": {
      access.exec("DELETE FROM transactions WHERE id = ?", payload.id);
      return { ok: true, data: { id: payload.id } };
    }

    case "split_transaction": {
      access.exec("DELETE FROM transactions WHERE parent_id = ?", payload.parentId);
      const results: string[] = [];
      for (const child of payload.children) {
        const row = createTransaction({ ...child, parentId: payload.parentId, isChild: true });
        access.exec(
          `INSERT INTO transactions (id, account_id, category_id, amount, payee, notes, date, cleared, imported_description, starting_balance_flag, sort_order, is_parent, is_child, parent_id, transfer_id, schedule_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id, row.accountId, row.categoryId, row.amount, row.payee, row.notes,
          row.date, row.cleared ? 1 : 0, row.importedDescription, row.startingBalanceFlag ? 1 : 0,
          row.sortOrder, row.isParent ? 1 : 0, row.isChild ? 1 : 0, row.parentId,
          row.transferId, row.scheduleId, row.createdAt, row.updatedAt,
        );
        results.push(row.id);
      }
      return { ok: true, data: { childIds: results } };
    }

    default:
      return { ok: false, error: `Unknown transaction command: ${commandType}` };
  }
}
