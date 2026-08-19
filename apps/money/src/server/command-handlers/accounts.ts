import { eq } from "drizzle-orm";
import type { Db } from "../d1-access";
import * as s from "../../db/schema";
import { createAccount } from "../../domain/factories";
import { nowIso } from "../../domain/types";
import type { CommandInvocation } from "../../domain/commands";
import type { CommandResult } from "../../domain/types";

type AccountCommand =
  | "create_account"
  | "update_account"
  | "delete_account"
  | "close_account"
  | "reopen_account"
  | "reorder_accounts"
  | "update_exchange_rate";

type AccountInvocation = Extract<CommandInvocation, { commandType: AccountCommand }>;

export async function handleAccountCommands(
  command: AccountInvocation,
  db: Db,
): Promise<CommandResult> {
  switch (command.commandType) {
    case "create_account": {
      const p = command.payload;
      const row = createAccount({
        name: p.name,
        offBudget: p.offBudget,
        balance: p.balance,
      });
      await db.insert(s.accounts).values(row).run();
      return { ok: true, data: { id: row.id } };
    }

    case "update_account": {
      const p = command.payload;
      const [existing] = await db.select().from(s.accounts).where(eq(s.accounts.id, p.id)).all();
      if (!existing) return { ok: false, error: "Account not found" };

      const set: Partial<typeof s.accounts.$inferInsert> = { updatedAt: nowIso() };
      if (p.name !== undefined) set.name = p.name;
      if (p.offBudget !== undefined) set.offbudget = p.offBudget;

      await db.update(s.accounts).set(set).where(eq(s.accounts.id, p.id)).run();
      return { ok: true, data: { id: p.id } };
    }

    case "delete_account": {
      const p = command.payload;
      await db.delete(s.accounts).where(eq(s.accounts.id, p.id)).run();
      return { ok: true, data: { id: p.id } };
    }

    case "close_account": {
      const p = command.payload;
      await db
        .update(s.accounts)
        .set({ closed: true, updatedAt: nowIso() })
        .where(eq(s.accounts.id, p.id))
        .run();
      return { ok: true, data: { id: p.id } };
    }

    case "reopen_account": {
      const p = command.payload;
      await db
        .update(s.accounts)
        .set({ closed: false, updatedAt: nowIso() })
        .where(eq(s.accounts.id, p.id))
        .run();
      return { ok: true, data: { id: p.id } };
    }

    case "reorder_accounts": {
      const p = command.payload;
      const now = nowIso();
      for (let i = 0; i < p.ids.length; i++) {
        await db
          .update(s.accounts)
          .set({ sortOrder: i, updatedAt: now })
          .where(eq(s.accounts.id, p.ids[i]))
          .run();
      }
      return { ok: true, data: { count: p.ids.length } };
    }

    case "update_exchange_rate": {
      const p = command.payload;
      await db
        .insert(s.exchangeRates)
        .values({
          id: "latest",
          usdToIdr: p.usdToIdr,
          updatedAt: nowIso(),
        })
        .onConflictDoUpdate({
          target: s.exchangeRates.id,
          set: { usdToIdr: p.usdToIdr, updatedAt: nowIso() },
        })
        .run();
      return { ok: true, data: {} };
    }

    default:
      return { ok: false, error: "Unknown account command" };
  }
}
