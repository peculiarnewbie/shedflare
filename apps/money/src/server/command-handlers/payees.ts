import type { DataAccess } from "../data-access";
import { createPayee } from "../../domain/factories";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export function handlePayeeCommands(
  commandType: string,
  payload: any,
  access: DataAccess,
): CommandResult {
  switch (commandType) {
    case "create_payee": {
      const row = createPayee(payload);
      access.exec(
        `INSERT INTO payees (id, name, transfer_account_id, favorite, created_at, updated_at)
         VALUES (?, ?, NULL, 0, ?, ?)`,
        row.id,
        row.name,
        row.createdAt,
        row.updatedAt,
      );
      return { ok: true, data: { id: row.id } };
    }

    case "update_payee": {
      const now = new Date().toISOString();
      const fields: string[] = ["updated_at = ?"];
      const params: unknown[] = [now];
      if (payload.name !== undefined) {
        fields.push("name = ?");
        params.push(payload.name);
      }
      if (payload.favorite !== undefined) {
        fields.push("favorite = ?");
        params.push(payload.favorite ? 1 : 0);
      }
      params.push(payload.id);
      access.exec(`UPDATE payees SET ${fields.join(", ")} WHERE id = ?`, ...params);
      return { ok: true, data: { id: payload.id } };
    }

    case "merge_payees": {
      for (const sourceId of payload.sourceIds) {
        access.exec(
          "UPDATE transactions SET payee = ? WHERE payee = ?",
          payload.targetId,
          sourceId,
        );
        access.exec("DELETE FROM payees WHERE id = ?", sourceId);
      }
      return { ok: true, data: { targetId: payload.targetId } };
    }

    default:
      return { ok: false, error: `Unknown payee command: ${commandType}` };
  }
}
