/**
 * Tests for budget-engine.ts — the core envelope budget computation.
 * Uses Node's built-in node:sqlite (available in Node 22.12+) — no mocks.
 */
/// <reference types="node" />
/// <reference types="@cloudflare/workers-types" />
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { describe, expect, test } from "vite-plus/test";
import * as schema from "../db/schema";
import { DataAccess } from "../server/data-access";
import { computeMonthBudget, computeNetWorth, computeAgeOfMoney } from "../server/budget-engine";
import { initializeStorage } from "../server/schema";

function sqliteD1(sqlite: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      const stmt = sqlite.prepare(query);
      return {
        bind: (...params: unknown[]) => ({
          first: async () => stmt.get(...(params as never[])) ?? null,
          all: async () => ({ results: stmt.all(...(params as never[])) }),
          run: async () => {
            stmt.run(...(params as never[]));
            return { success: true, meta: {} };
          },
        }),
      };
    },
    batch: () => {
      throw new Error("batch not implemented in test D1");
    },
    exec: async () => {},
  } as unknown as D1Database;
}

function createTestDb() {
  const sqlite = new DatabaseSync(":memory:");
  const drizzleDb = drizzle({ client: sqlite, schema });
  const d1 = sqliteD1(sqlite);
  const access = new DataAccess(d1, drizzleDb as unknown as DrizzleD1Database<typeof schema>);

  const exec = (query: string, ...params: unknown[]) => {
    if (params.length > 0) {
      sqlite.prepare(query).run(...(params as never[]));
    } else {
      sqlite.exec(query);
    }
  };
  const queryOne = <T extends Record<string, unknown>>(
    query: string,
    ...params: unknown[]
  ): T | null => {
    const rows = sqlite.prepare(query).all(...(params as never[])) as T[];
    return rows[0] ?? null;
  };
  initializeStorage(exec, queryOne, () => {});
  sqlite.exec("PRAGMA foreign_keys = OFF");
  return { sqlite, access };
}

function run(sqlite: DatabaseSync, sql: string, ...params: unknown[]) {
  sqlite.prepare(sql).run(...(params as never[]));
}

describe("computeMonthBudget", () => {
  test("returns null when no categories exist", () => {
    const { access } = createTestDb();
    expect(computeMonthBudget(access, 202604)).toBeNull();
  });

  test("budgeted minus spending equals leftover", () => {
    const { access, sqlite } = createTestDb();
    const now = new Date().toISOString();
    run(
      sqlite,
      "INSERT INTO category_groups VALUES (?,?,?,?,?,?,?)",
      "cgrp_1",
      "General",
      0,
      0,
      0,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO categories VALUES (?,?,?,?,?,?,?,?,?)",
      "cat_1",
      "Groceries",
      0,
      "cgrp_1",
      0,
      0,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO budgets VALUES (?,?,?,?,?,?,?)",
      "202604-cat_1",
      202604,
      "cat_1",
      100000,
      0,
      now,
      now,
    );
    run(
      sqlite,
      `INSERT INTO transactions
       (id, account_id, category_id, amount, payee, notes, date, cleared, reconciled,
        imported_description, starting_balance_flag, sort_order, is_parent, is_child,
        parent_id, transfer_id, schedule_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      "txn_1",
      "acct_1",
      "cat_1",
      -30000,
      "Store",
      null,
      "2026-04-15",
      1,
      null,
      null,
      0,
      null,
      0,
      0,
      null,
      null,
      null,
      now,
      now,
    );

    const result = computeMonthBudget(access, 202604)!;
    expect(result.categories[0].budgeted).toBe(100000);
    expect(result.categories[0].spent).toBe(-30000);
    expect(result.categories[0].leftover).toBe(70000);
  });

  test("overspending yields negative leftover, zero leftoverPos", () => {
    const { access, sqlite } = createTestDb();
    const now = new Date().toISOString();
    run(
      sqlite,
      "INSERT INTO category_groups VALUES (?,?,?,?,?,?,?)",
      "cgrp_1",
      "General",
      0,
      0,
      0,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO categories VALUES (?,?,?,?,?,?,?,?,?)",
      "cat_1",
      "Groceries",
      0,
      "cgrp_1",
      0,
      0,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO budgets VALUES (?,?,?,?,?,?,?)",
      "202604-cat_1",
      202604,
      "cat_1",
      50000,
      0,
      now,
      now,
    );
    run(
      sqlite,
      `INSERT INTO transactions
       (id, account_id, category_id, amount, payee, notes, date, cleared, reconciled,
        imported_description, starting_balance_flag, sort_order, is_parent, is_child,
        parent_id, transfer_id, schedule_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      "txn_1",
      "acct_1",
      "cat_1",
      -80000,
      "Store",
      null,
      "2026-04-10",
      1,
      null,
      null,
      0,
      null,
      0,
      0,
      null,
      null,
      null,
      now,
      now,
    );

    const result = computeMonthBudget(access, 202604)!;
    expect(result.categories[0].leftover).toBe(-30000);
    expect(result.categories[0].leftoverPos).toBe(0);
  });

  test("carryover=true carries negative leftover forward", () => {
    const { access, sqlite } = createTestDb();
    const now = new Date().toISOString();
    run(
      sqlite,
      "INSERT INTO category_groups VALUES (?,?,?,?,?,?,?)",
      "cgrp_1",
      "General",
      0,
      0,
      0,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO categories VALUES (?,?,?,?,?,?,?,?,?)",
      "cat_1",
      "Groceries",
      0,
      "cgrp_1",
      0,
      0,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO budgets VALUES (?,?,?,?,?,?,?)",
      "202603-cat_1",
      202603,
      "cat_1",
      0,
      0,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO budgets VALUES (?,?,?,?,?,?,?)",
      "202604-cat_1",
      202604,
      "cat_1",
      50000,
      1,
      now,
      now,
    );
    run(
      sqlite,
      `INSERT INTO transactions
       (id, account_id, category_id, amount, payee, notes, date, cleared, reconciled,
        imported_description, starting_balance_flag, sort_order, is_parent, is_child,
        parent_id, transfer_id, schedule_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      "txn_1",
      "acct_1",
      "cat_1",
      -50000,
      "Store",
      null,
      "2026-03-15",
      1,
      null,
      null,
      0,
      null,
      0,
      0,
      null,
      null,
      null,
      now,
      now,
    );

    const result = computeMonthBudget(access, 202604)!;
    expect(result.categories[0].leftover).toBe(0);
  });

  test("toBudget = income - budgeted - buffered", () => {
    const { access, sqlite } = createTestDb();
    const now = new Date().toISOString();
    run(
      sqlite,
      "INSERT INTO category_groups VALUES (?,?,?,?,?,?,?)",
      "cgrp_i",
      "Income",
      0,
      0,
      1,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO category_groups VALUES (?,?,?,?,?,?,?)",
      "cgrp_e",
      "Expenses",
      0,
      0,
      0,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO categories VALUES (?,?,?,?,?,?,?,?,?)",
      "cat_i",
      "Salary",
      1,
      "cgrp_i",
      0,
      0,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO categories VALUES (?,?,?,?,?,?,?,?,?)",
      "cat_e",
      "Rent",
      0,
      "cgrp_e",
      0,
      0,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO budgets VALUES (?,?,?,?,?,?,?)",
      "202604-cat_e",
      202604,
      "cat_e",
      100000,
      0,
      now,
      now,
    );
    run(
      sqlite,
      `INSERT INTO transactions
       (id, account_id, category_id, amount, payee, notes, date, cleared, reconciled,
        imported_description, starting_balance_flag, sort_order, is_parent, is_child,
        parent_id, transfer_id, schedule_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      "txn_1",
      "acct_1",
      "cat_i",
      200000,
      null,
      null,
      "2026-04-01",
      1,
      null,
      null,
      0,
      null,
      0,
      0,
      null,
      null,
      null,
      now,
      now,
    );
    run(sqlite, "INSERT INTO budget_months VALUES (?,?,?,?)", "2026-04", 50000, now, now);

    const result = computeMonthBudget(access, 202604)!;
    expect(result.toBudget).toBe(50000);
  });

  test("multiple categories grouped correctly", () => {
    const { access, sqlite } = createTestDb();
    const now = new Date().toISOString();
    run(
      sqlite,
      "INSERT INTO category_groups VALUES (?,?,?,?,?,?,?)",
      "cgrp_1",
      "Needs",
      0,
      0,
      0,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO categories VALUES (?,?,?,?,?,?,?,?,?)",
      "cat_1",
      "Rent",
      0,
      "cgrp_1",
      0,
      0,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO categories VALUES (?,?,?,?,?,?,?,?,?)",
      "cat_2",
      "Food",
      0,
      "cgrp_1",
      1,
      0,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO budgets VALUES (?,?,?,?,?,?,?)",
      "202604-cat_1",
      202604,
      "cat_1",
      100000,
      0,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO budgets VALUES (?,?,?,?,?,?,?)",
      "202604-cat_2",
      202604,
      "cat_2",
      50000,
      0,
      now,
      now,
    );

    const result = computeMonthBudget(access, 202604)!;
    expect(result.categories).toHaveLength(2);
    expect(result.toBudget).toBe(-150000);
  });
});

describe("computeNetWorth", () => {
  test("sums open account balances", () => {
    const { access, sqlite } = createTestDb();
    const now = new Date().toISOString();
    run(
      sqlite,
      "INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "acct_1",
      "Checking",
      0,
      0,
      0,
      100000,
      null,
      null,
      null,
      null,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "acct_2",
      "Savings",
      0,
      0,
      1,
      500000,
      null,
      null,
      null,
      null,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "acct_3",
      "Closed",
      0,
      1,
      2,
      0,
      null,
      null,
      null,
      null,
      null,
      now,
      now,
    );

    expect(computeNetWorth(access)).toBe(600000);
  });
});

describe("computeAgeOfMoney", () => {
  test("returns null when cash is zero", () => {
    const { access } = createTestDb();
    expect(computeAgeOfMoney(access)).toBeNull();
  });

  test("age = currentCash / avgDailySpending (using recent dates)", () => {
    const { access, sqlite } = createTestDb();
    const now = new Date().toISOString();
    const today = new Date();
    run(
      sqlite,
      "INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      "acct_1",
      "Checking",
      0,
      0,
      0,
      90000,
      null,
      null,
      null,
      null,
      null,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO category_groups VALUES (?,?,?,?,?,?,?)",
      "cgrp_1",
      "General",
      0,
      0,
      0,
      now,
      now,
    );
    run(
      sqlite,
      "INSERT INTO categories VALUES (?,?,?,?,?,?,?,?,?)",
      "cat_1",
      "Expenses",
      0,
      "cgrp_1",
      0,
      0,
      null,
      now,
      now,
    );
    const insertTxnSql = [
      "INSERT INTO transactions",
      "(id, account_id, category_id, amount, payee, notes, date, cleared, reconciled,",
      " imported_description, starting_balance_flag, sort_order, is_parent, is_child,",
      " parent_id, transfer_id, schedule_id, created_at, updated_at)",
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ].join("\n");
    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - 89 + i);
      const ds = d.toISOString().slice(0, 10);
      run(
        sqlite,
        insertTxnSql,
        `txn_${i}`,
        "acct_1",
        "cat_1",
        -1000,
        null,
        null,
        ds,
        1,
        null,
        null,
        0,
        null,
        0,
        0,
        null,
        null,
        null,
        now,
        now,
      );
    }

    const age = computeAgeOfMoney(access);
    expect(age).not.toBeNull();
    expect(age).toBeGreaterThan(0);
  });
});
