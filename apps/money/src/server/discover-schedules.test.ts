import { describe, expect, test, beforeEach } from "vite-plus/test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-sqlite";
import * as schema from "../db/schema";
import type { Db } from "./d1-access";
import { discoverSchedules } from "./discover-schedules";

const MIGRATIONS_DIR = join(import.meta.dirname, "../migrations");

function createTestDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  const db = drizzle({ client: sqlite });
  const dirs = readdirSync(MIGRATIONS_DIR).sort();
  for (const dir of dirs) {
    const raw = readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      sqlite.exec(stmt);
    }
  }
  sqlite.exec(
    `INSERT OR IGNORE INTO exchange_rates (id, usd_to_idr, updated_at) VALUES ('latest', 16000, '${new Date().toISOString()}')`,
  );
  sqlite.exec("PRAGMA foreign_keys = OFF");
  return db as unknown as Db;
}

function insertAccount(db: Db, id: string, name: string): void {
  const now = new Date().toISOString();
  void db
    .insert(schema.accounts)
    .values({
      id,
      name,
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
    })
    .run();
}

function insertTxn(
  db: Db,
  id: string,
  accountId: string,
  payee: string,
  amount: number,
  date: string,
): void {
  const now = new Date().toISOString();
  void db
    .insert(schema.transactions)
    .values({
      id,
      accountId,
      categoryId: null,
      amount,
      payee,
      notes: null,
      date,
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
    })
    .run();
}

describe("discoverSchedules", () => {
  let db: Db;

  beforeEach(() => {
    db = createTestDb();
  });

  test("returns nothing when there are no transactions", async () => {
    expect(await discoverSchedules(db)).toEqual([]);
  });

  test("skips transactions with no payee", async () => {
    insertAccount(db, "acct_1", "Checking");
    insertTxn(db, "txn_1", "acct_1", "", -1000, "2026-04-01");
    insertTxn(db, "txn_2", "acct_1", "", -1000, "2026-05-01");
    insertTxn(db, "txn_3", "acct_1", "", -1000, "2026-06-01");
    expect(await discoverSchedules(db)).toEqual([]);
  });

  test("skips child transactions", async () => {
    insertAccount(db, "acct_1", "Checking");
    const now = new Date().toISOString();
    insertTxn(db, "txn_1", "acct_1", "Netflix", -1500, "2026-04-15");
    insertTxn(db, "txn_2", "acct_1", "Netflix", -1500, "2026-05-15");
    insertTxn(db, "txn_3", "acct_1", "Netflix", -1500, "2026-06-15");
    await db.update(schema.transactions).set({ isChild: true }).run();
    expect(await discoverSchedules(db)).toEqual([]);
    void now;
  });

  test("skips transfer transactions", async () => {
    insertAccount(db, "acct_1", "Checking");
    insertAccount(db, "acct_2", "Savings");
    insertTxn(db, "txn_1", "acct_1", "X", -1000, "2026-04-01");
    insertTxn(db, "txn_2", "acct_1", "X", -1000, "2026-05-01");
    insertTxn(db, "txn_3", "acct_1", "X", -1000, "2026-06-01");
    await db.update(schema.transactions).set({ transferId: "transfer_1" }).run();
    expect(await discoverSchedules(db)).toEqual([]);
  });

  test("needs at least 3 transactions to detect a schedule", async () => {
    insertAccount(db, "acct_1", "Checking");
    insertTxn(db, "txn_1", "acct_1", "Netflix", -1500, "2026-04-15");
    insertTxn(db, "txn_2", "acct_1", "Netflix", -1500, "2026-05-15");
    expect(await discoverSchedules(db)).toEqual([]);
  });

  test("detects a monthly recurring charge", async () => {
    insertAccount(db, "acct_1", "Checking");
    insertTxn(db, "txn_1", "acct_1", "Netflix", -1500, "2026-01-15");
    insertTxn(db, "txn_2", "acct_1", "Netflix", -1500, "2026-02-15");
    insertTxn(db, "txn_3", "acct_1", "Netflix", -1500, "2026-03-15");
    insertTxn(db, "txn_4", "acct_1", "Netflix", -1500, "2026-04-15");

    const out = await discoverSchedules(db);
    expect(out).toHaveLength(1);
    expect(out[0].payee).toBe("Netflix");
    expect(out[0].amount).toBe(-1500);
    expect(out[0].recurrenceType).toBe("monthly");
    expect(out[0].accountName).toBe("Checking");
    expect(out[0].confidence).toBeGreaterThanOrEqual(40);
  });

  test("ignores schedules for payees that already have an active schedule", async () => {
    insertAccount(db, "acct_1", "Checking");
    // Payee that owns the existing active schedule
    await db
      .insert(schema.payees)
      .values({
        id: "pay_1",
        name: "Netflix",
        transferAccountId: null,
        favorite: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    await db
      .insert(schema.schedules)
      .values({
        id: "sch_1",
        name: "Netflix sub",
        accountId: "acct_1",
        payeeId: "pay_1",
        categoryId: null,
        amount: -1500,
        startDate: "2026-01-15",
        recurrenceRules: "FREQ=MONTHLY",
        active: true,
        completed: false,
        postsTransaction: false,
        customUpcomingLength: null,
        nextDate: "2026-05-15",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();

    insertTxn(db, "txn_1", "acct_1", "Netflix", -1500, "2026-01-15");
    insertTxn(db, "txn_2", "acct_1", "Netflix", -1500, "2026-02-15");
    insertTxn(db, "txn_3", "acct_1", "Netflix", -1500, "2026-03-15");
    insertTxn(db, "txn_4", "acct_1", "Netflix", -1500, "2026-04-15");

    expect(await discoverSchedules(db)).toEqual([]);
  });

  test("treats wildly different intervals as not-recurring", async () => {
    insertAccount(db, "acct_1", "Checking");
    // Intervals 5, 8, 40 days — high CV fails the recurrence check.
    insertTxn(db, "txn_1", "acct_1", "Random", -1000, "2026-01-01");
    insertTxn(db, "txn_2", "acct_1", "Random", -1000, "2026-01-06");
    insertTxn(db, "txn_3", "acct_1", "Random", -1000, "2026-01-14");
    insertTxn(db, "txn_4", "acct_1", "Random", -1000, "2026-02-23");
    const out = await discoverSchedules(db);
    expect(out).toEqual([]);
  });

  test("groups per (payee, account) — same payee in two accounts is two schedules", async () => {
    insertAccount(db, "acct_1", "Checking");
    insertAccount(db, "acct_2", "Card");
    insertTxn(db, "txn_1", "acct_1", "Spotify", -999, "2026-01-15");
    insertTxn(db, "txn_2", "acct_1", "Spotify", -999, "2026-02-15");
    insertTxn(db, "txn_3", "acct_1", "Spotify", -999, "2026-03-15");
    insertTxn(db, "txn_4", "acct_2", "Spotify", -999, "2026-01-20");
    insertTxn(db, "txn_5", "acct_2", "Spotify", -999, "2026-02-20");
    insertTxn(db, "txn_6", "acct_2", "Spotify", -999, "2026-03-20");
    const out = await discoverSchedules(db);
    expect(out).toHaveLength(2);
    const accounts = out.map((s) => s.accountId).sort();
    expect(accounts).toEqual(["acct_1", "acct_2"]);
  });
});
