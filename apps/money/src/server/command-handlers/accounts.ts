/**
 * Account command handlers — create, update, close, reopen, reorder,
 * and exchange rate updates.
 */
import type { SyncServerEvent } from "../../domain/events";
import type { DataAccess } from "../data-access";
import type { EventStore } from "../event-store";
import { createAccount } from "../../domain/factories";
import { decodeCommand } from "../../domain/commands";
import { castId, type AccountId } from "../../domain/types";

export function handleAccountCommands(
  opId: string,
  payload: any,
  access: DataAccess,
  eventStore: EventStore,
): { events: SyncServerEvent[] } {
  const events: SyncServerEvent[] = [];

  switch (payload.commandType ?? "create_account") {
    case "create_account": {
      const valid = decodeCommand("create_account", payload);
      const row = createAccount({
        name: valid.name,
        offBudget: valid.offBudget,
        balance: valid.balance,
      });
      events.push(eventStore.insertEvent(opId, "account_created", { row }) as SyncServerEvent);
      break;
    }

    case "update_account": {
      const valid = decodeCommand("update_account", payload);
      const existing = access.getAccount(castId<AccountId>(valid.id));
      if (existing) {
        const updated = {
          ...existing,
          name: valid.name ?? existing.name,
          offbudget: valid.offBudget ?? existing.offbudget,
          lastReconciled:
            valid.lastReconciled !== undefined ? valid.lastReconciled : existing.lastReconciled,
          updatedAt: new Date().toISOString(),
        };
        events.push(
          eventStore.insertEvent(opId, "account_updated", { row: updated }) as SyncServerEvent,
        );
      }
      break;
    }

    case "delete_account": {
      const valid = decodeCommand("delete_account", payload);
      const existing = access.getAccount(castId<AccountId>(valid.id));
      if (existing) {
        events.push(
          eventStore.insertEvent(opId, "account_deleted", { id: valid.id }) as SyncServerEvent,
        );
      }
      break;
    }

    case "close_account": {
      const valid = decodeCommand("close_account", payload);
      const existing = access.getAccount(castId<AccountId>(valid.id));
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
            id: valid.id,
            closedAt: new Date().toISOString(),
          }) as SyncServerEvent,
        );
      }
      break;
    }

    case "reopen_account": {
      const valid = decodeCommand("reopen_account", payload);
      const existing = access.getAccount(castId<AccountId>(valid.id));
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
      const valid = decodeCommand("reorder_accounts", payload);
      for (let i = 0; i < valid.ids.length; i++) {
        const existing = access.getAccount(castId<AccountId>(valid.ids[i]));
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
      const valid = decodeCommand("update_exchange_rate", payload);
      const now = new Date().toISOString();
      events.push(
        eventStore.insertEvent(opId, "exchange_rate_updated", {
          usdToIdr: valid.usdToIdr,
          updatedAt: now,
        }) as SyncServerEvent,
      );
      break;
    }
  }

  return { events };
}
