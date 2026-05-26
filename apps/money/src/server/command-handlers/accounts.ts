import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createAccount } from "../../domain/factories";
import { nowIso } from "../../domain/types";

export type CommandResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

export async function handleAccountCommands(
  commandType: string,
  payload: any,
  db: Db,
): Promise<CommandResult> {
  switch (commandType) {
    case "create_account": {
      const row = createAccount({
        name: payload.name,
        offBudget: payload.offBudget,
        balance: payload.balance,
      });
      await db.insert(s.accounts).values(row);
      return { ok: true, data: { id: row.id } };
    }

    case "update_account": {
      const [existing] = await db
        .select()
        .from(s.accounts)
        .where(eq(s.accounts.id, payload.id))
        .all();
      if (!existing) return { ok: false, error: "Account not found" };

      const set: Record<string, unknown> = { updatedAt: nowIso() };
      if (payload.name !== undefined) set.name = payload.name;
      if (payload.offBudget !== undefined) set.offbudget = payload.offBudget;

      await db.update(s.accounts).set(set).where(eq(s.accounts.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    case "delete_account": {
      await db.delete(s.accounts).where(eq(s.accounts.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    case "close_account": {
      await db
        .update(s.accounts)
        .set({ closed: true, updatedAt: nowIso() })
        .where(eq(s.accounts.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    case "reopen_account": {
      await db
        .update(s.accounts)
        .set({ closed: false, updatedAt: nowIso() })
        .where(eq(s.accounts.id, payload.id));
      return { ok: true, data: { id: payload.id } };
    }

    case "reorder_accounts": {
      const now = nowIso();
      for (let i = 0; i < payload.ids.length; i++) {
        await db
          .update(s.accounts)
          .set({ sortOrder: i, updatedAt: now })
          .where(eq(s.accounts.id, payload.ids[i]));
      }
      return { ok: true, data: { count: payload.ids.length } };
    }

    case "update_exchange_rate": {
      await db
        .insert(s.exchangeRates)
        .values({
          id: "latest",
          usdToIdr: payload.usdToIdr,
          updatedAt: nowIso(),
        })
        .onConflictDoUpdate({
          target: s.exchangeRates.id,
          set: { usdToIdr: payload.usdToIdr, updatedAt: nowIso() },
        });
      return { ok: true, data: {} };
    }

    default:
      return { ok: false, error: `Unknown account command: ${commandType}` };
  }
}
