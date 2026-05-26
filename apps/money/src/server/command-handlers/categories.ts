import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createCategory, createCategoryGroup } from "../../domain/factories";
import { nowIso } from "../../domain/types";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export async function handleCategoryCommands(
  commandType: string,
  payload: any,
  db: Db,
): Promise<CommandResult> {
  switch (commandType) {
    case "create_category": {
      const row = createCategory(payload);
      await db.insert(s.categories).values(row);
      return { ok: true, data: { id: row.id } };
    }

    case "update_category": {
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (payload.name !== undefined) set.name = payload.name;
      if (payload.hidden !== undefined) set.hidden = payload.hidden;
      if (payload.groupId !== undefined) set.groupId = payload.groupId;
      if (payload.goalDef !== undefined) set.goalDef = payload.goalDef;
      await db.update(s.categories).set(set).where(eq(s.categories.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    case "delete_category": {
      if (payload.transferToId) {
        await db
          .update(s.transactions)
          .set({ categoryId: payload.transferToId })
          .where(eq(s.transactions.categoryId, payload.id));
      }
      await db.delete(s.categories).where(eq(s.categories.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    case "create_category_group": {
      const row = createCategoryGroup(payload);
      await db.insert(s.categoryGroups).values(row);
      return { ok: true, data: { id: row.id } };
    }

    case "update_category_group": {
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (payload.name !== undefined) set.name = payload.name;
      if (payload.hidden !== undefined) set.hidden = payload.hidden;
      if (payload.isIncome !== undefined) set.isIncome = payload.isIncome;
      await db.update(s.categoryGroups).set(set).where(eq(s.categoryGroups.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    case "reorder_categories": {
      const now = nowIso();
      for (let i = 0; i < payload.ids.length; i++) {
        await db
          .update(s.categories)
          .set({ sortOrder: i, updatedAt: now })
          .where(eq(s.categories.id, payload.ids[i]));
      }
      return { ok: true, data: { count: payload.ids.length } };
    }

    case "delete_category_group": {
      if (payload.transferToGroupId) {
        await db
          .update(s.categories)
          .set({ groupId: payload.transferToGroupId })
          .where(eq(s.categories.groupId, payload.id));
      } else {
        await db
          .update(s.categories)
          .set({ groupId: null })
          .where(eq(s.categories.groupId, payload.id));
      }
      await db.delete(s.categoryGroups).where(eq(s.categoryGroups.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    default:
      return { ok: false, error: `Unknown category command: ${commandType}` };
  }
}
