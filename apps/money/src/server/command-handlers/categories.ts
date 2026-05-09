/**
 * Category & Category Group command handlers.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createCategory, createCategoryGroup } from "../../domain/factories";

export function handleCategoryCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_category") {
    case "create_category": {
      const row = createCategory({
        name: payload.name,
        groupId: payload.groupId,
        isIncome: payload.isIncome,
      });
      events.push(eventStore.insertEvent(opId, "category_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_category": {
      const existing = access.getCategory(payload.id);
      if (existing) {
        const updated = {
          ...existing,
          name: payload.name ?? existing.name,
          hidden: payload.hidden ?? existing.hidden,
          groupId: payload.groupId !== undefined ? payload.groupId : existing.groupId,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "category_updated", { row: updated }) as SyncServerEvent,
        );

        // Recalculate budget if category was hidden/unhidden (affects totals)
        if (payload.hidden !== undefined && payload.hidden !== existing.hidden) {
          // Emit a budget recalc for the current month
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
      const existing = access.getCategory(payload.id);
      if (existing) {
        events.push(
          eventStore.insertEvent(opId, "category_updated", {
            row: { ...existing, hidden: true, updatedAt: new Date().toISOString() },
          }) as SyncServerEvent,
        );
      }
      break;
    }

    case "create_category_group": {
      const row = createCategoryGroup({
        name: payload.name,
        isIncome: payload.isIncome,
      });
      events.push(
        eventStore.insertEvent(opId, "category_group_created", { row }) as SyncServerEvent,
      );
      break;
    }

    case "update_category_group": {
      const existing = access.getCategoryGroup(payload.id);
      if (existing) {
        const updated = {
          ...existing,
          name: payload.name ?? existing.name,
          hidden: payload.hidden ?? existing.hidden,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "category_group_updated", {
            row: updated,
          }) as SyncServerEvent,
        );
      }
      break;
    }

    case "reorder_categories": {
      for (let i = 0; i < payload.ids.length; i++) {
        const existing = access.getCategory(payload.ids[i]);
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
