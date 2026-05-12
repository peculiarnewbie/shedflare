/**
 * Category & Category Group command handlers.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createCategory, createCategoryGroup } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";
import { castId, type CategoryId, type CategoryGroupId } from "../../domain/types";

export function handleCategoryCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_category") {
    case "create_category": {
      const valid = decodeCommand("create_category", payload);
      const row = createCategory({
        name: valid.name,
        groupId: valid.groupId,
        isIncome: valid.isIncome,
      });
      events.push(eventStore.insertEvent(opId, "category_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_category": {
      const valid = decodeCommand("update_category", payload);
      const existing = access.getCategory(castId<CategoryId>(valid.id));
      if (existing) {
        const updated = {
          ...existing,
          name: valid.name ?? existing.name,
          hidden: valid.hidden ?? existing.hidden,
          groupId: valid.groupId !== undefined ? valid.groupId : existing.groupId,
          goalDef: valid.goalDef !== undefined ? valid.goalDef : existing.goalDef,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "category_updated", { row: updated }) as SyncServerEvent,
        );

        if (valid.hidden !== undefined && valid.hidden !== existing.hidden) {
          const now = new Date();
          const month = now.getFullYear() * 100 + (now.getMonth() + 1);
          events.push(
            eventStore.insertEvent(opId, "budget_recalculated", {
              month,
              toBudget: 0,
              buffered: 0,
            }) as SyncServerEvent,
          );
        }
      }
      break;
    }

    case "delete_category": {
      const valid = decodeCommand("delete_category", payload);
      const existing = access.getCategory(castId<CategoryId>(valid.id));
      if (existing) {
        const updated = {
          ...existing,
          hidden: true,
          updatedAt: new Date().toISOString(),
        };

        if (valid.transferToId) {
          access.exec(
            `UPDATE transactions SET category_id = ? WHERE category_id = ?`,
            valid.transferToId,
            existing.id,
          );
          access.exec(`UPDATE budgets SET amount = 0 WHERE category_id = ?`, existing.id);
        }

        events.push(
          eventStore.insertEvent(opId, "category_updated", { row: updated }) as SyncServerEvent,
        );
      }
      break;
    }

    case "create_category_group": {
      const valid = decodeCommand("create_category_group", payload);
      const row = createCategoryGroup({
        name: valid.name,
        isIncome: valid.isIncome,
      });
      events.push(
        eventStore.insertEvent(opId, "category_group_created", { row }) as SyncServerEvent,
      );
      break;
    }

    case "update_category_group": {
      const valid = decodeCommand("update_category_group", payload);
      const existing = access.getCategoryGroup(castId<CategoryGroupId>(valid.id));
      if (existing) {
        const updated = {
          ...existing,
          name: valid.name ?? existing.name,
          hidden: valid.hidden ?? existing.hidden,
          isIncome: valid.isIncome !== undefined ? valid.isIncome : existing.isIncome,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "category_group_updated", {
            row: updated,
          }) as SyncServerEvent,
        );

        if (valid.isIncome !== undefined && valid.isIncome !== existing.isIncome) {
          const month = new Date().getFullYear() * 100 + (new Date().getMonth() + 1);
          events.push(
            eventStore.insertEvent(opId, "budget_recalculated", {
              month,
              toBudget: 0,
              buffered: 0,
            }) as SyncServerEvent,
          );
        }
      }
      break;
    }

    case "delete_category_group": {
      const valid = decodeCommand("delete_category_group", payload);
      const existing = access.getCategoryGroup(castId<CategoryGroupId>(valid.id));
      if (existing) {
        const groupCats = access.queryAll<{ id: string }>(
          `SELECT id FROM categories WHERE group_id = ?`,
          existing.id,
        );

        if (valid.transferToGroupId) {
          for (const cat of groupCats) {
            const catRow = access.getCategory(castId<CategoryId>(cat.id));
            if (catRow) {
              const updated = {
                ...catRow,
                groupId: valid.transferToGroupId,
                updatedAt: new Date().toISOString(),
              };
              events.push(
                eventStore.insertEvent(opId, "category_updated", {
                  row: updated,
                }) as SyncServerEvent,
              );
            }
          }
        } else {
          for (const cat of groupCats) {
            const catRow = access.getCategory(castId<CategoryId>(cat.id));
            if (catRow) {
              const updated = { ...catRow, hidden: true, updatedAt: new Date().toISOString() };
              events.push(
                eventStore.insertEvent(opId, "category_updated", {
                  row: updated,
                }) as SyncServerEvent,
              );
            }
          }
        }

        events.push(
          eventStore.insertEvent(opId, "category_group_deleted", {
            id: existing.id,
          }) as SyncServerEvent,
        );
      }
      break;
    }

    case "reorder_categories": {
      const valid = decodeCommand("reorder_categories", payload);
      for (let i = 0; i < valid.ids.length; i++) {
        const existing = access.getCategory(castId<CategoryId>(valid.ids[i]));
        if (existing) {
          const updated = {
            ...existing,
            sortOrder: i,
            updatedAt: new Date().toISOString(),
          };
          events.push(
            eventStore.insertEvent(opId, "category_updated", { row: updated }) as SyncServerEvent,
          );
        }
      }
      break;
    }
  }

  return { events };
}
