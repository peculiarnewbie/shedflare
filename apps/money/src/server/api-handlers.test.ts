import { describe, expect, test, beforeEach } from "vite-plus/test";
import { handleApiRequest } from "./api-handlers";
import { createMoneyTestEnv, dbFor, type MoneyTestEnv, type Db } from "../test/helpers";

const NOW = "2026-04-15T12:00:00.000Z";

let env: MoneyTestEnv;
let db: Db;

beforeEach(() => {
  env = createMoneyTestEnv();
  db = dbFor(env);
});

async function get(path: string) {
  return handleApiRequest(new URL(`http://test${path}`), "GET", db);
}

describe("GET /api/accounts", () => {
  test("returns an empty list when there are no accounts", async () => {
    const res = await get("/api/accounts");
    expect(res?.status).toBe(200);
    const body = (await res!.json()) as { accounts: unknown[] };
    expect(body.accounts).toEqual([]);
  });

  test("returns accounts with a calculated balance", async () => {
    const now = NOW;
    await db
      .insert((await import("../db/schema")).accounts)
      .values({
        id: "acct_1",
        name: "Checking",
        offbudget: false,
        closed: false,
        sortOrder: 0,
        balanceCurrent: 100_00,
        balanceAvailable: null,
        balanceLimit: null,
        mask: null,
        officialName: null,
        lastReconciled: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert((await import("../db/schema")).transactions)
      .values({
        id: "txn_1",
        accountId: "acct_1",
        categoryId: null,
        amount: -25_00,
        payee: null,
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
      })
      .run();

    const res = await get("/api/accounts");
    const body = (await res!.json()) as {
      accounts: Array<{ id: string; name: string; balanceCurrent: number }>;
    };
    expect(body.accounts).toHaveLength(1);
    expect(body.accounts[0]).toMatchObject({
      id: "acct_1",
      name: "Checking",
      balanceCurrent: 100_00 - 25_00,
    });
  });
});

describe("GET /api/accounts/:id", () => {
  test("returns the single account or 404", async () => {
    const res = await get("/api/accounts/missing");
    expect(res?.status).toBe(404);
  });

  test("returns the matching account", async () => {
    const now = NOW;
    await db
      .insert((await import("../db/schema")).accounts)
      .values({
        id: "acct_1",
        name: "Checking",
        offbudget: false,
        closed: false,
        sortOrder: 0,
        balanceCurrent: 50_00,
        balanceAvailable: null,
        balanceLimit: null,
        mask: null,
        officialName: null,
        lastReconciled: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const res = await get("/api/accounts/acct_1");
    expect(res?.status).toBe(200);
    const body = (await res!.json()) as { id: string; name: string };
    expect(body.id).toBe("acct_1");
    expect(body.name).toBe("Checking");
  });
});

describe("GET /api/categories and /api/category-groups", () => {
  test("returns empty arrays when none exist", async () => {
    const cats = await get("/api/categories");
    const groups = await get("/api/category-groups");
    expect(((await cats!.json()) as { categories: unknown[] }).categories).toEqual([]);
    expect(((await groups!.json()) as { groups: unknown[] }).groups).toEqual([]);
  });

  test("returns categories with the group name joined in", async () => {
    const now = NOW;
    const s = await import("../db/schema");
    await db
      .insert(s.categoryGroups)
      .values({
        id: "cgrp_1",
        name: "Needs",
        isIncome: false,
        sortOrder: 0,
        hidden: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(s.categories)
      .values({
        id: "cat_1",
        name: "Groceries",
        isIncome: false,
        groupId: "cgrp_1",
        sortOrder: 0,
        hidden: false,
        goalDef: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const res = await get("/api/categories");
    const body = (await res!.json()) as {
      categories: Array<{ id: string; name: string }>;
    };
    expect(body.categories).toHaveLength(1);
    expect(body.categories[0]).toMatchObject({ id: "cat_1", name: "Groceries" });
  });
});

describe("GET /api/tags", () => {
  test("returns an empty list by default", async () => {
    const res = await get("/api/tags");
    const body = (await res!.json()) as { tags: unknown[] };
    expect(body.tags).toEqual([]);
  });

  test("returns tags ordered by name", async () => {
    const now = NOW;
    await db
      .insert((await import("../db/schema")).tags)
      .values([
        { id: "tag_2", name: "Zeta", color: null, createdAt: now },
        { id: "tag_1", name: "Alpha", color: "#fff", createdAt: now },
      ])
      .run();
    const res = await get("/api/tags");
    const body = (await res!.json()) as { tags: Array<{ name: string }> };
    expect(body.tags.map((t) => t.name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("GET /api/payees", () => {
  test("returns payees with a transaction count", async () => {
    const now = NOW;
    const s = await import("../db/schema");
    await db
      .insert(s.payees)
      .values({
        id: "pay_1",
        name: "Whole Foods",
        transferAccountId: null,
        favorite: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(s.accounts)
      .values({
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
      })
      .run();
    await db
      .insert(s.transactions)
      .values([
        {
          id: "txn_1",
          accountId: "acct_1",
          categoryId: null,
          amount: -1000,
          payee: "Whole Foods",
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
        },
        {
          id: "txn_2",
          accountId: "acct_1",
          categoryId: null,
          amount: -2000,
          payee: "Whole Foods",
          notes: null,
          date: "2026-04-12",
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
        },
      ])
      .run();

    const res = await get("/api/payees");
    const body = (await res!.json()) as {
      payees: Array<{ name: string; transaction_count: number }>;
    };
    expect(body.payees).toHaveLength(1);
    expect(body.payees[0]).toMatchObject({ name: "Whole Foods", transaction_count: 2 });
  });
});

describe("GET /api/payees/category-suggestions", () => {
  test("returns empty suggestions when no payee is given", async () => {
    const res = await get("/api/payees/category-suggestions");
    const body = (await res!.json()) as { suggestions: unknown[] };
    expect(body.suggestions).toEqual([]);
  });

  test("returns suggestions ordered by count", async () => {
    const now = NOW;
    const s = await import("../db/schema");
    await db
      .insert(s.categoryGroups)
      .values({
        id: "cgrp_1",
        name: "Food",
        isIncome: false,
        sortOrder: 0,
        hidden: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(s.categories)
      .values([
        {
          id: "cat_a",
          name: "Coffee",
          isIncome: false,
          groupId: "cgrp_1",
          sortOrder: 0,
          hidden: false,
          goalDef: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "cat_b",
          name: "Lunch",
          isIncome: false,
          groupId: "cgrp_1",
          sortOrder: 1,
          hidden: false,
          goalDef: null,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    await db
      .insert(s.accounts)
      .values({
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
      })
      .run();
    await db
      .insert(s.transactions)
      .values([
        {
          id: "txn_1",
          accountId: "acct_1",
          categoryId: "cat_a",
          amount: -500,
          payee: "Blue Bottle",
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
        },
        {
          id: "txn_2",
          accountId: "acct_1",
          categoryId: "cat_a",
          amount: -600,
          payee: "Blue Bottle",
          notes: null,
          date: "2026-04-03",
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
        },
        {
          id: "txn_3",
          accountId: "acct_1",
          categoryId: "cat_b",
          amount: -1200,
          payee: "Blue Bottle",
          notes: null,
          date: "2026-04-04",
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
        },
      ])
      .run();
    const res = await get("/api/payees/category-suggestions?payee=Blue%20Bottle");
    const body = (await res!.json()) as {
      suggestions: Array<{ category_id: string; count: number }>;
    };
    expect(body.suggestions).toHaveLength(2);
    expect(body.suggestions[0].category_id).toBe("cat_a");
    expect(body.suggestions[0].count).toBe(2);
    expect(body.suggestions[1].count).toBe(1);
  });
});

describe("GET /api/transactions", () => {
  test("returns an empty list when there are no transactions", async () => {
    const res = await get("/api/transactions");
    const body = (await res!.json()) as { transactions: unknown[] };
    expect(body.transactions).toEqual([]);
  });

  test("orders by date desc and includes joined names", async () => {
    const now = NOW;
    const s = await import("../db/schema");
    await db
      .insert(s.accounts)
      .values({
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
      })
      .run();
    await db
      .insert(s.categoryGroups)
      .values({
        id: "cgrp_1",
        name: "G",
        isIncome: false,
        sortOrder: 0,
        hidden: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(s.categories)
      .values({
        id: "cat_1",
        name: "Food",
        isIncome: false,
        groupId: "cgrp_1",
        sortOrder: 0,
        hidden: false,
        goalDef: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(s.transactions)
      .values([
        {
          id: "txn_a",
          accountId: "acct_1",
          categoryId: "cat_1",
          amount: -500,
          payee: "Old",
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
          createdAt: "2026-04-01T00:00:00Z",
          updatedAt: "2026-04-01T00:00:00Z",
        },
        {
          id: "txn_b",
          accountId: "acct_1",
          categoryId: "cat_1",
          amount: -700,
          payee: "New",
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
          createdAt: "2026-04-10T00:00:00Z",
          updatedAt: "2026-04-10T00:00:00Z",
        },
      ])
      .run();
    const res = await get("/api/transactions");
    const body = (await res!.json()) as {
      transactions: Array<{ id: string; accountName: string; categoryName: string }>;
    };
    expect(body.transactions).toHaveLength(2);
    expect(body.transactions[0].id).toBe("txn_b");
    expect(body.transactions[0].categoryName).toBe("Food");
    expect(body.transactions[0].accountName).toBe("Checking");
  });
});

describe("GET /api/filters and /api/rules", () => {
  test("returns an empty filters list", async () => {
    const res = await get("/api/filters");
    expect(((await res!.json()) as { filters: unknown[] }).filters).toEqual([]);
  });

  test("returns only non-deleted rules", async () => {
    const now = NOW;
    await db
      .insert((await import("../db/schema")).rules)
      .values([
        {
          id: "rule_1",
          stage: "pre",
          conditionsOp: "and",
          conditions: "[]",
          actions: "[]",
          active: true,
          deleted: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "rule_2",
          stage: "pre",
          conditionsOp: "and",
          conditions: "[]",
          actions: "[]",
          active: true,
          deleted: true,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    const res = await get("/api/rules");
    const body = (await res!.json()) as { rules: Array<{ id: string }> };
    expect(body.rules.map((r) => r.id)).toEqual(["rule_1"]);
  });
});

describe("GET /api/dashboard/widgets", () => {
  test("returns widgets ordered by position", async () => {
    const now = NOW;
    await db
      .insert((await import("../db/schema")).dashboardWidgets)
      .values([
        {
          id: "w_2",
          type: "net",
          x: 6,
          y: 0,
          width: 6,
          height: 3,
          meta: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "w_1",
          type: "age",
          x: 0,
          y: 0,
          width: 6,
          height: 3,
          meta: null,
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    const res = await get("/api/dashboard/widgets");
    const body = (await res!.json()) as { widgets: Array<{ id: string }> };
    expect(body.widgets.map((w) => w.id)).toEqual(["w_1", "w_2"]);
  });
});

describe("GET /api/dashboard/export", () => {
  test("returns a v1 export with the current widgets", async () => {
    const res = await get("/api/dashboard/export");
    const body = (await res!.json()) as { version: number; widgets: unknown[]; exportedAt: string };
    expect(body.version).toBe(1);
    expect(body.widgets).toEqual([]);
    expect(typeof body.exportedAt).toBe("string");
  });
});

describe("GET /api/export/csv", () => {
  test("returns a CSV with a header and a row per transaction", async () => {
    const now = NOW;
    const s = await import("../db/schema");
    await db
      .insert(s.accounts)
      .values({
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
      })
      .run();
    await db
      .insert(s.categoryGroups)
      .values({
        id: "cgrp_1",
        name: "G",
        isIncome: false,
        sortOrder: 0,
        hidden: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(s.categories)
      .values({
        id: "cat_1",
        name: "Food",
        isIncome: false,
        groupId: "cgrp_1",
        sortOrder: 0,
        hidden: false,
        goalDef: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    await db
      .insert(s.transactions)
      .values({
        id: "txn_1",
        accountId: "acct_1",
        categoryId: "cat_1",
        amount: -1500,
        payee: "Store",
        notes: "x",
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
      })
      .run();
    const res = await get("/api/export/csv");
    expect(res?.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("text/csv");
    const text = await res!.text();
    expect(text.startsWith("Date,Amount,Payee,Category,Notes,Account")).toBe(true);
    expect(text).toContain("Checking");
    expect(text).toContain("2026-04-10");
    expect(text.length).toBeGreaterThan("Date,Amount,Payee,Category,Notes,Account\n".length);
  });
});

describe("GET /api/rates", () => {
  test("returns the seeded default exchange rate", async () => {
    const res = await get("/api/rates");
    const body = (await res!.json()) as { id: string; usdToIdr: number };
    expect(body.id).toBe("latest");
    expect(body.usdToIdr).toBe(16000);
  });
});

describe("unhandled paths", () => {
  test("returns null so the router falls through", async () => {
    expect(await get("/api/does-not-exist")).toBeNull();
  });
});
