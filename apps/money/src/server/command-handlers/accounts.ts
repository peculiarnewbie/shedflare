/**
 * Account command handlers — create, update, close, reopen, reorder,
 * and exchange rate updates.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createAccount } from "../../domain/factories";

export function handleAccountCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_account") {
    case "create_account": {
      const row = createAccount({
        name: payload.name,
        offBudget: payload.offBudget,
        balance: payload.balance,
      });
      events.push(eventStore.insertEvent(opId, "account_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_account": {
      const existing = access.getAccount(payload.id);
      if (existing) {
        const updated = {
          ...existing,
          name: payload.name ?? existing.name,
          offbudget: payload.offBudget ?? existing.offbudget,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "account_updated", { row: updated }) as SyncServerEvent,
        );
      }
      break;
    }

    case "close_account": {
      const existing = access.getAccount(payload.id);
      if (existing && !existing.closed) {
        const updated = {
          ...existing,
          closed: true,
          lastReconciled: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "account_updated", { row: updated }) as SyncServerEvent,
        );
        events.push(
          eventStore.insertEvent(opId, "account_closed", {
            id: payload.id,
            closedAt: new Date().toISOString(),
          }) as SyncServerEvent,
        );
      }
      break;
    }

    case "reopen_account": {
      const existing = access.getAccount(payload.id);
      if (existing && existing.closed) {
        const updated = {
          ...existing,
          closed: false,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "account_updated", { row: updated }) as SyncServerEvent,
        );
      }
      break;
    }

    case "reorder_accounts": {
      for (let i = 0; i < payload.ids.length; i++) {
        const existing = access.getAccount(payload.ids[i]);
        if (existing) {
          const updated = {
            ...existing,
            sortOrder: i,
            updatedAt: new Date().toISOString(),
          };
          events.push(
            eventStore.insertEvent(opId, "account_updated", { row: updated }) as SyncServerEvent,
          );
        }
      }
      break;
    }

    case "update_exchange_rate": {
      const now = new Date().toISOString();
      events.push(
        eventStore.insertEvent(opId, "exchange_rate_updated", {
          usdToIdr: payload.usdToIdr,
          updatedAt: now,
        }) as SyncServerEvent,
      );
      break;
    }
  }

  return { events };
}
