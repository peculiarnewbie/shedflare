import { describe, expect, test } from "vite-plus/test";
import * as s from "../../db/schema";
import { createMoneyTestEnv, dbFor } from "../../test/helpers";
import { handleCommand } from "./handle-command";
import type { CommandResult } from "../../domain/types";

function commandId(result: CommandResult): string {
  if (!result.ok) throw new Error(result.error);
  if (!result.data.id) throw new Error("Command result did not include an id");
  return result.data.id;
}

describe("money command persistence", () => {
  test("account and transaction mutations survive a fresh read", async () => {
    const db = dbFor(createMoneyTestEnv());

    const createdAccount = await handleCommand(db, {
      commandType: "create_account",
      payload: { name: "Daily spending", balance: 25_000 },
    });
    expect(createdAccount.ok).toBe(true);
    if (!createdAccount.ok) throw new Error(createdAccount.error);

    const accountId = commandId(createdAccount);

    const [account] = await db.select().from(s.accounts).all();
    expect(account).toMatchObject({ id: accountId, name: "Daily spending" });

    const updatedAccount = await handleCommand(db, {
      commandType: "update_account",
      payload: { id: accountId, name: "Everyday spending" },
    });
    expect(updatedAccount.ok).toBe(true);
    const [renamed] = await db.select().from(s.accounts).all();
    expect(renamed?.name).toBe("Everyday spending");

    const createdTransaction = await handleCommand(db, {
      commandType: "create_transaction",
      payload: {
        row: {
          accountId,
          date: "2026-08-11",
          amount: -1_250,
          payee: "Lunch",
        },
      },
    });
    expect(createdTransaction.ok).toBe(true);
    if (!createdTransaction.ok) throw new Error(createdTransaction.error);
    const transactionId = commandId(createdTransaction);

    const [transaction] = await db.select().from(s.transactions).all();
    expect(transaction).toMatchObject({ id: transactionId, accountId, amount: -1_250 });

    const deleted = await handleCommand(db, {
      commandType: "delete_transaction",
      payload: { id: transactionId },
    });
    expect(deleted.ok).toBe(true);
    expect(await db.select().from(s.transactions).all()).toHaveLength(0);
  });

  test("upsert commands execute instead of returning an unexecuted builder", async () => {
    const db = dbFor(createMoneyTestEnv());

    const result = await handleCommand(db, {
      commandType: "update_setting",
      payload: { key: "currency", value: "IDR" },
    });

    expect(result.ok).toBe(true);
    const [setting] = await db.select().from(s.settings).all();
    expect(setting).toMatchObject({ key: "currency", value: "IDR" });
  });

  test("creates an ungrouped category from the compact budget flow", async () => {
    const db = dbFor(createMoneyTestEnv());

    const result = await handleCommand(db, {
      commandType: "create_category",
      payload: { name: "Flexible", groupId: null },
    });

    expect(result.ok).toBe(true);
    const [category] = await db.select().from(s.categories).all();
    expect(category).toMatchObject({ name: "Flexible", groupId: null });
  });

  test("supports the inverse command used when undoing payee creation", async () => {
    const db = dbFor(createMoneyTestEnv());
    const created = await handleCommand(db, {
      commandType: "create_payee",
      payload: { name: "Temporary payee" },
    });
    expect(created.ok).toBe(true);
    const payeeId = commandId(created);

    const deleted = await handleCommand(db, {
      commandType: "delete_payee",
      payload: { id: payeeId },
    });

    expect(deleted.ok).toBe(true);
    expect(await db.select().from(s.payees).all()).toHaveLength(0);
  });

  test("merges payee names in transactions and references in schedules", async () => {
    const db = dbFor(createMoneyTestEnv());
    const account = await handleCommand(db, {
      commandType: "create_account",
      payload: { name: "Checking" },
    });
    const target = await handleCommand(db, {
      commandType: "create_payee",
      payload: { name: "New Store" },
    });
    const source = await handleCommand(db, {
      commandType: "create_payee",
      payload: { name: "Old Store" },
    });
    const accountId = commandId(account);
    const targetId = commandId(target);
    const sourceId = commandId(source);

    await handleCommand(db, {
      commandType: "create_transaction",
      payload: {
        row: {
          accountId,
          date: "2026-08-11",
          amount: -500,
          payee: "Old Store",
        },
      },
    });
    await handleCommand(db, {
      commandType: "create_schedule",
      payload: {
        schedule: {
          accountId,
          payeeId: sourceId,
          recurrenceRules: JSON.stringify({ type: "monthly" }),
        },
      },
    });

    const merged = await handleCommand(db, {
      commandType: "merge_payees",
      payload: { targetId, sourceIds: [sourceId] },
    });

    expect(merged.ok).toBe(true);
    const [transaction] = await db.select().from(s.transactions).all();
    const [schedule] = await db.select().from(s.schedules).all();
    expect(transaction?.payee).toBe("New Store");
    expect(schedule?.payeeId).toBe(targetId);
    expect(await db.select().from(s.payees).all()).toHaveLength(1);
  });
});
