import type { DataAccess } from "../data-access";
import { createAccount } from "../../domain/factories";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export function handleAccountCommands(
  commandType: string,
  payload: any,
  access: DataAccess,
): CommandResult {
  switch (commandType) {
    case "create_account": {
      const row = createAccount({
        name: payload.name,
        offBudget: payload.offBudget,
        balance: payload.balance,
      });
      access.exec(
        `INSERT INTO accounts (id, name, offbudget, closed, sort_order, balance_current, last_reconciled, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, ?, NULL, ?, ?)`,
        row.id,
        row.name,
        row.offbudget ? 1 : 0,
        row.balanceCurrent,
        row.createdAt,
        row.updatedAt,
      );
      return { ok: true, data: { id: row.id } };
    }

    case "update_account": {
      const existing = access.queryOne<Record<string, unknown>>(
        "SELECT * FROM accounts WHERE id = ?",
        payload.id,
      );
      if (!existing) return { ok: false, error: "Account not found" };

      const name = payload.name ?? existing.name;
      const offbudget =
        payload.offBudget !== undefined ? (payload.offBudget ? 1 : 0) : existing.offbudget;
      const now = new Date().toISOString();
      access.exec(
        `UPDATE accounts SET name = ?, offbudget = ?, updated_at = ? WHERE id = ?`,
        name,
        offbudget,
        now,
        payload.id,
      );
      return { ok: true, data: { id: payload.id } };
    }

    case "delete_account": {
      access.exec("DELETE FROM accounts WHERE id = ?", payload.id);
      return { ok: true, data: { id: payload.id } };
    }

    case "close_account": {
      const now = new Date().toISOString();
      access.exec("UPDATE accounts SET closed = 1, updated_at = ? WHERE id = ?", now, payload.id);
      return { ok: true, data: { id: payload.id } };
    }

    case "reopen_account": {
      const now = new Date().toISOString();
      access.exec("UPDATE accounts SET closed = 0, updated_at = ? WHERE id = ?", now, payload.id);
      return { ok: true, data: { id: payload.id } };
    }

    case "reorder_accounts": {
      const now = new Date().toISOString();
      for (let i = 0; i < payload.ids.length; i++) {
        access.exec(
          "UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ?",
          i,
          now,
          payload.ids[i],
        );
      }
      return { ok: true, data: { count: payload.ids.length } };
    }

    case "update_exchange_rate": {
      const now = new Date().toISOString();
      access.exec(
        `INSERT OR REPLACE INTO exchange_rates (id, usd_to_idr, updated_at) VALUES (?, ?, ?)`,
        "latest",
        payload.usdToIdr,
        now,
      );
      return { ok: true, data: {} };
    }

    default:
      return { ok: false, error: `Unknown account command: ${commandType}` };
  }
}
