import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createCategory, createCategoryGroup } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandPayloadMap } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type CategoryCommand =
  | "create_category"
  | "update_category"
  | "delete_category"
  | "create_category_group"
  | "update_category_group"
  | "delete_category_group"
  | "reorder_categories";

export async function handleCategoryCommands(
  commandType: CategoryCommand,
  payload: CommandPayloadMap[CategoryCommand],
  db: Db,
): Promise<CommandResult> {
  switch (commandType) {
    case "create_category": {
      const p = payload as CommandPayloadMap["create_category"];
      const row = createCategory(p);
      await db.insert(s.categories).values(row);
      return { ok: true, data: { id: row.id } };
    }

    case "update_category": {
      const p = payload as CommandPayloadMap["update_category"];
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (p.name !== undefined) set.name = p.name;
      if (p.hidden !== undefined) set.hidden = p.hidden;
      if (p.groupId !== undefined) set.groupId = p.groupId;
      if (p.goalDef !== undefined) set.goalDef = p.goalDef;
      await db.update(s.categories).set(set).where(eq(s.categories.id, p.id));
      return { ok: true, data: { id: p.id } };
    }

    case "delete_category": {
      const p = payload as CommandPayloadMap["delete_category"];
      if (p.transferToId) {
        await db
          .update(s.transactions)
          .set({ categoryId: p.transferToId })
          .where(eq(s.transactions.categoryId, p.id));
      }
      await db.delete(s.categories).where(eq(s.categories.id, p.id));
      return { ok: true, data: { id: p.id } };
    }

    case "create_category_group": {
      const p = payload as CommandPayloadMap["create_category_group"];
      const row = createCategoryGroup(p);
      await db.insert(s.categoryGroups).values(row);
      return { ok: true, data: { id: row.id } };
    }

    case "update_category_group": {
      const p = payload as CommandPayloadMap["update_category_group"];
      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (p.name !== undefined) set.name = p.name;
      if (p.hidden !== undefined) set.hidden = p.hidden;
      if (p.isIncome !== undefined) set.isIncome = p.isIncome;
      await db.update(s.categoryGroups).set(set).where(eq(s.categoryGroups.id, p.id));
      return { ok: true, data: { id: p.id } };
    }

    case "reorder_categories": {
      const p = payload as CommandPayloadMap["reorder_categories"];
      const now = nowIso();
      for (let i = 0; i < p.ids.length; i++) {
        await db
          .update(s.categories)
          .set({ sortOrder: i, updatedAt: now })
          .where(eq(s.categories.id, p.ids[i]));
      }
      return { ok: true, data: { count: p.ids.length } };
    }

    case "delete_category_group": {
      const p = payload as CommandPayloadMap["delete_category_group"];
      if (p.transferToGroupId) {
        await db
          .update(s.categories)
          .set({ groupId: p.transferToGroupId })
          .where(eq(s.categories.groupId, p.id));
      } else {
        await db.update(s.categories).set({ groupId: null }).where(eq(s.categories.groupId, p.id));
      }
      await db.delete(s.categoryGroups).where(eq(s.categoryGroups.id, p.id));
      return { ok: true, data: { id: p.id } };
    }

    default:
      return { ok: false, error: "Unknown category command: " + String(commandType) };
  }
}
