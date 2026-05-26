import type { DataAccess } from "../data-access";
import { createCategory, createCategoryGroup } from "../../domain/factories";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export function handleCategoryCommands(
  commandType: string,
  payload: any,
  access: DataAccess,
): CommandResult {
  switch (commandType) {
    case "create_category": {
      const row = createCategory(payload);
      access.exec(
        `INSERT INTO categories (id, name, is_income, group_id, sort_order, hidden, goal_def, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, NULL, ?, ?)`,
        row.id, row.name, row.isIncome ? 1 : 0, row.groupId, row.createdAt, row.updatedAt,
      );
      return { ok: true, data: { id: row.id } };
    }

    case "update_category": {
      const now = new Date().toISOString();
      const fields: string[] = ["updated_at = ?"];
      const params: unknown[] = [now];
      if (payload.name !== undefined) { fields.push("name = ?"); params.push(payload.name); }
      if (payload.hidden !== undefined) { fields.push("hidden = ?"); params.push(payload.hidden ? 1 : 0); }
      if (payload.groupId !== undefined) { fields.push("group_id = ?"); params.push(payload.groupId); }
      if (payload.goalDef !== undefined) { fields.push("goal_def = ?"); params.push(payload.goalDef); }
      params.push(payload.id);
      access.exec(`UPDATE categories SET ${fields.join(", ")} WHERE id = ?`, ...params);
      return { ok: true, data: { id: payload.id } };
    }

    case "delete_category": {
      const id = payload.id;
      if (payload.transferToId) {
        access.exec("UPDATE transactions SET category_id = ? WHERE category_id = ?", payload.transferToId, id);
      }
      access.exec("DELETE FROM categories WHERE id = ?", id);
      return { ok: true, data: { id } };
    }

    case "create_category_group": {
      const row = createCategoryGroup(payload);
      access.exec(
        `INSERT INTO category_groups (id, name, is_income, sort_order, hidden, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, ?, ?)`,
        row.id, row.name, row.isIncome ? 1 : 0, row.createdAt, row.updatedAt,
      );
      return { ok: true, data: { id: row.id } };
    }

    case "update_category_group": {
      const now = new Date().toISOString();
      const fields: string[] = ["updated_at = ?"];
      const params: unknown[] = [now];
      if (payload.name !== undefined) { fields.push("name = ?"); params.push(payload.name); }
      if (payload.hidden !== undefined) { fields.push("hidden = ?"); params.push(payload.hidden ? 1 : 0); }
      if (payload.isIncome !== undefined) { fields.push("is_income = ?"); params.push(payload.isIncome ? 1 : 0); }
      params.push(payload.id);
      access.exec(`UPDATE category_groups SET ${fields.join(", ")} WHERE id = ?`, ...params);
      return { ok: true, data: { id: payload.id } };
    }

    case "reorder_categories": {
      const now = new Date().toISOString();
      for (let i = 0; i < payload.ids.length; i++) {
        access.exec("UPDATE categories SET sort_order = ?, updated_at = ? WHERE id = ?", i, now, payload.ids[i]);
      }
      return { ok: true, data: { count: payload.ids.length } };
    }

    default:
      return { ok: false, error: `Unknown category command: ${commandType}` };
  }
}
