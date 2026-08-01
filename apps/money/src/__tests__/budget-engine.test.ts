/**
 * Tests for budget-engine.ts — the core envelope budget computation.
 * Uses Node's built-in node:sqlite (available in Node 22.12+) with Drizzle node-sqlite driver.
 */
/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-sqlite";
import { describe, expect, test } from "vite-plus/test";
import { applyDrizzleMigrations } from "@shedflare/test-utils/migrations";
import * as schema from "../db/schema";
import { computeMonthBudget, computeNetWorth, computeAgeOfMoney } from "../server/budget-engine";
import type { Db } from "../server/d1-access";

const MIGRATIONS_DIR = join(import.meta.dirname, "../migrations");

function createTestDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  const db = drizzle({ client: sqlite });

  applyDrizzleMigrations(sqlite, MIGRATIONS_DIR);
  sqlite.exec(
    `INSERT OR IGNORE INTO exchange_rates (id, usd_to_idr, updated_at) VALUES ('latest', 16000, '${new Date().toISOString()}')`,
  );
  sqlite.exec("PRAGMA foreign_keys = OFF");
  return db as unknown as Db;
}

describe("computeMonthBudget", () => {
  test("returns null when no categories exist", async () => {
    const db = createTestDb();
    expect(await computeMonthBudget(db, 202604)).toBeNull();
  });

  test("budgeted minus spending equals leftover", async () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    await db.insert(schema.categoryGroups).values({
      id: "cgrp_1",
      name: "General",
      isIncome: false,
      sortOrder: 0,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categories).values({
      id: "cat_1",
      name: "Groceries",
      isIncome: false,
      groupId: "cgrp_1",
      sortOrder: 0,
      hidden: false,
      goalDef: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.budgets).values({
      id: "202604-cat_1",
      month: 202604,
      categoryId: "cat_1",
      amount: 100000,
      carryover: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.accounts).values({
      id: "acct_1",
      name: "Checking",
      offbudget: false,
      closed: false,
      sortOrder: 0,
      balanceCurrent: null,
      balanceAvailable: null,
      balanceLimit: null,
      mask: null,
      officialName: null,
      lastReconciled: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.transactions).values({
      id: "txn_1",
      accountId: "acct_1",
      categoryId: "cat_1",
      amount: -30000,
      payee: "Store",
      notes: null,
      date: "2026-04-15",
      cleared: true,
      reconciled: false,
      importedDescription: null,
      startingBalanceFlag: false,
      sortOrder: null,
      isParent: false,
      isChild: false,
      parentId: null,
      transferId: null,
      scheduleId: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = (await computeMonthBudget(db, 202604))!;
    expect(result.categories[0].budgeted).toBe(100000);
    expect(result.categories[0].spent).toBe(-30000);
    expect(result.categories[0].leftover).toBe(70000);
  });

  test("includes spending on the last calendar day of the month", async () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    await db.insert(schema.categoryGroups).values({
      id: "cgrp_1",
      name: "General",
      isIncome: false,
      sortOrder: 0,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categories).values({
      id: "cat_1",
      name: "Groceries",
      isIncome: false,
      groupId: "cgrp_1",
      sortOrder: 0,
      hidden: false,
      goalDef: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.budgets).values({
      id: "202604-cat_1",
      month: 202604,
      categoryId: "cat_1",
      amount: 100000,
      carryover: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.accounts).values({
      id: "acct_1",
      name: "Checking",
      offbudget: false,
      closed: false,
      sortOrder: 0,
      balanceCurrent: null,
      balanceAvailable: null,
      balanceLimit: null,
      mask: null,
      officialName: null,
      lastReconciled: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.transactions).values({
      id: "txn_last",
      accountId: "acct_1",
      categoryId: "cat_1",
      amount: -25000,
      payee: "Store",
      notes: null,
      date: "2026-04-30",
      cleared: true,
      reconciled: false,
      importedDescription: null,
      startingBalanceFlag: false,
      sortOrder: null,
      isParent: false,
      isChild: false,
      parentId: null,
      transferId: null,
      scheduleId: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = (await computeMonthBudget(db, 202604))!;
    expect(result.categories[0].spent).toBe(-25000);
  });

  test("overspending yields negative leftover, zero leftoverPos", async () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    await db.insert(schema.categoryGroups).values({
      id: "cgrp_1",
      name: "General",
      isIncome: false,
      sortOrder: 0,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categories).values({
      id: "cat_1",
      name: "Groceries",
      isIncome: false,
      groupId: "cgrp_1",
      sortOrder: 0,
      hidden: false,
      goalDef: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.budgets).values({
      id: "202604-cat_1",
      month: 202604,
      categoryId: "cat_1",
      amount: 50000,
      carryover: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.accounts).values({
      id: "acct_1",
      name: "Checking",
      offbudget: false,
      closed: false,
      sortOrder: 0,
      balanceCurrent: null,
      balanceAvailable: null,
      balanceLimit: null,
      mask: null,
      officialName: null,
      lastReconciled: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.transactions).values({
      id: "txn_1",
      accountId: "acct_1",
      categoryId: "cat_1",
      amount: -80000,
      payee: "Store",
      notes: null,
      date: "2026-04-10",
      cleared: true,
      reconciled: false,
      importedDescription: null,
      startingBalanceFlag: false,
      sortOrder: null,
      isParent: false,
      isChild: false,
      parentId: null,
      transferId: null,
      scheduleId: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = (await computeMonthBudget(db, 202604))!;
    expect(result.categories[0].leftover).toBe(-30000);
    expect(result.categories[0].leftoverPos).toBe(0);
  });

  test("carryover=true carries negative leftover forward", async () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    await db.insert(schema.categoryGroups).values({
      id: "cgrp_1",
      name: "General",
      isIncome: false,
      sortOrder: 0,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categories).values({
      id: "cat_1",
      name: "Groceries",
      isIncome: false,
      groupId: "cgrp_1",
      sortOrder: 0,
      hidden: false,
      goalDef: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.budgets).values({
      id: "202603-cat_1",
      month: 202603,
      categoryId: "cat_1",
      amount: 0,
      carryover: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.budgets).values({
      id: "202604-cat_1",
      month: 202604,
      categoryId: "cat_1",
      amount: 50000,
      carryover: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.accounts).values({
      id: "acct_1",
      name: "Checking",
      offbudget: false,
      closed: false,
      sortOrder: 0,
      balanceCurrent: null,
      balanceAvailable: null,
      balanceLimit: null,
      mask: null,
      officialName: null,
      lastReconciled: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.transactions).values({
      id: "txn_1",
      accountId: "acct_1",
      categoryId: "cat_1",
      amount: -50000,
      payee: "Store",
      notes: null,
      date: "2026-03-15",
      cleared: true,
      reconciled: false,
      importedDescription: null,
      startingBalanceFlag: false,
      sortOrder: null,
      isParent: false,
      isChild: false,
      parentId: null,
      transferId: null,
      scheduleId: null,
      createdAt: now,
      updatedAt: now,
    });

    const result = (await computeMonthBudget(db, 202604))!;
    expect(result.categories[0].leftover).toBe(0);
  });

  test("toBudget = income - budgeted - buffered", async () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    await db.insert(schema.categoryGroups).values({
      id: "cgrp_i",
      name: "Income",
      isIncome: false,
      sortOrder: 0,
      hidden: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categoryGroups).values({
      id: "cgrp_e",
      name: "Expenses",
      isIncome: false,
      sortOrder: 0,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categories).values({
      id: "cat_i",
      name: "Salary",
      isIncome: true,
      groupId: "cgrp_i",
      sortOrder: 0,
      hidden: false,
      goalDef: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categories).values({
      id: "cat_e",
      name: "Rent",
      isIncome: false,
      groupId: "cgrp_e",
      sortOrder: 0,
      hidden: false,
      goalDef: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.budgets).values({
      id: "202604-cat_e",
      month: 202604,
      categoryId: "cat_e",
      amount: 100000,
      carryover: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.accounts).values({
      id: "acct_1",
      name: "Checking",
      offbudget: false,
      closed: false,
      sortOrder: 0,
      balanceCurrent: null,
      balanceAvailable: null,
      balanceLimit: null,
      mask: null,
      officialName: null,
      lastReconciled: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.transactions).values({
      id: "txn_1",
      accountId: "acct_1",
      categoryId: "cat_i",
      amount: 200000,
      payee: null,
      notes: null,
      date: "2026-04-01",
      cleared: true,
      reconciled: false,
      importedDescription: null,
      startingBalanceFlag: false,
      sortOrder: null,
      isParent: false,
      isChild: false,
      parentId: null,
      transferId: null,
      scheduleId: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.budgetMonths).values({
      id: "2026-04",
      buffered: 50000,
      createdAt: now,
      updatedAt: now,
    });

    const result = (await computeMonthBudget(db, 202604))!;
    expect(result.toBudget).toBe(50000);
  });

  test("multiple categories grouped correctly", async () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    await db.insert(schema.categoryGroups).values({
      id: "cgrp_1",
      name: "Needs",
      isIncome: false,
      sortOrder: 0,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categories).values({
      id: "cat_1",
      name: "Rent",
      isIncome: false,
      groupId: "cgrp_1",
      sortOrder: 0,
      hidden: false,
      goalDef: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categories).values({
      id: "cat_2",
      name: "Food",
      isIncome: false,
      groupId: "cgrp_1",
      sortOrder: 1,
      hidden: false,
      goalDef: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.budgets).values({
      id: "202604-cat_1",
      month: 202604,
      categoryId: "cat_1",
      amount: 100000,
      carryover: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.budgets).values({
      id: "202604-cat_2",
      month: 202604,
      categoryId: "cat_2",
      amount: 50000,
      carryover: false,
      createdAt: now,
      updatedAt: now,
    });

    const result = (await computeMonthBudget(db, 202604))!;
    expect(result.categories).toHaveLength(2);
    expect(result.toBudget).toBe(-150000);
  });
});

describe("computeNetWorth", () => {
  test("sums open account balances", async () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    await db.insert(schema.accounts).values({
      id: "acct_1",
      name: "Checking",
      offbudget: false,
      closed: false,
      sortOrder: 0,
      balanceCurrent: 100000,
      balanceAvailable: null,
      balanceLimit: null,
      mask: null,
      officialName: null,
      lastReconciled: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.accounts).values({
      id: "acct_2",
      name: "Savings",
      offbudget: false,
      closed: false,
      sortOrder: 1,
      balanceCurrent: 500000,
      balanceAvailable: null,
      balanceLimit: null,
      mask: null,
      officialName: null,
      lastReconciled: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.accounts).values({
      id: "acct_3",
      name: "Closed",
      offbudget: false,
      closed: true,
      sortOrder: 2,
      balanceCurrent: 0,
      balanceAvailable: null,
      balanceLimit: null,
      mask: null,
      officialName: null,
      lastReconciled: null,
      createdAt: now,
      updatedAt: now,
    });

    expect(await computeNetWorth(db)).toBe(600000);
  });
});

describe("computeAgeOfMoney", () => {
  test("returns null when cash is zero", async () => {
    const db = createTestDb();
    expect(await computeAgeOfMoney(db)).toBeNull();
  });

  test("age = currentCash / avgDailySpending", async () => {
    const db = createTestDb();
    const now = new Date().toISOString();
    const today = new Date();

    // Opening balance is stored separately from ledger activity.
    // Live cash = opening + Σ(non-child txs) = 180000 - 90000 = 90000.
    await db.insert(schema.accounts).values({
      id: "acct_1",
      name: "Checking",
      offbudget: false,
      closed: false,
      sortOrder: 0,
      balanceCurrent: 180000,
      balanceAvailable: null,
      balanceLimit: null,
      mask: null,
      officialName: null,
      lastReconciled: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categoryGroups).values({
      id: "cgrp_1",
      name: "General",
      isIncome: false,
      sortOrder: 0,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.categories).values({
      id: "cat_1",
      name: "Expenses",
      isIncome: false,
      groupId: "cgrp_1",
      sortOrder: 0,
      hidden: false,
      goalDef: null,
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 0; i < 90; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89 + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      await db.insert(schema.transactions).values({
        id: `txn_${i}`,
        accountId: "acct_1",
        categoryId: "cat_1",
        amount: -1000,
        payee: null,
        notes: null,
        date: ds,
        cleared: true,
        reconciled: false,
        importedDescription: null,
        startingBalanceFlag: false,
        sortOrder: null,
        isParent: false,
        isChild: false,
        parentId: null,
        transferId: null,
        scheduleId: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const age = await computeAgeOfMoney(db);
    expect(age).not.toBeNull();
    expect(age).toBe(90);
  });
});
