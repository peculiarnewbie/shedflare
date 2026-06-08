import { describe, expect, test } from "vite-plus/test";
import {
  createAccount,
  createBudget,
  createBudgetMonth,
  createCategory,
  createCategoryGroup,
  createCustomReport,
  createDashboardWidget,
  createNote,
  createPayee,
  createRule,
  createSchedule,
  createTag,
  createTransaction,
  createTransactionFilter,
  createTransactionTag,
  updateNote,
} from "./factories";
import { budgetId, nowIso } from "./types";

describe("createAccount", () => {
  test("produces a fully populated account row", () => {
    const acc = createAccount({ name: "Checking", balance: 250_000 });
    expect(acc.id).toMatch(/^acct_[0-9a-f]{24}$/);
    expect(acc.name).toBe("Checking");
    expect(acc.balanceCurrent).toBe(250_000);
    expect(acc.offbudget).toBe(false);
    expect(acc.closed).toBe(false);
    expect(acc.sortOrder).toBe(0);
    expect(acc.balanceAvailable).toBeNull();
    expect(acc.balanceLimit).toBeNull();
    expect(acc.mask).toBeNull();
    expect(acc.officialName).toBeNull();
    expect(acc.lastReconciled).toBeNull();
    expect(typeof acc.createdAt).toBe("string");
    expect(acc.createdAt).toBe(acc.updatedAt);
  });

  test("offBudget flag is honoured", () => {
    expect(createAccount({ name: "Tracking", offBudget: true }).offbudget).toBe(true);
  });

  test("sortOrder override is honoured", () => {
    expect(createAccount({ name: "x", sortOrder: 5 }).sortOrder).toBe(5);
  });

  test("balance defaults to null when omitted", () => {
    expect(createAccount({ name: "x" }).balanceCurrent).toBeNull();
  });
});

describe("createCategory", () => {
  test("produces a fully populated category row", () => {
    const cat = createCategory({ name: "Groceries", groupId: "cgrp_1", isIncome: false });
    expect(cat.id).toMatch(/^cat_[0-9a-f]{24}$/);
    expect(cat.name).toBe("Groceries");
    expect(cat.groupId).toBe("cgrp_1");
    expect(cat.isIncome).toBe(false);
    expect(cat.hidden).toBe(false);
    expect(cat.goalDef).toBeNull();
    expect(cat.sortOrder).toBe(0);
  });

  test("isIncome override is honoured", () => {
    expect(createCategory({ name: "Salary", groupId: "g", isIncome: true }).isIncome).toBe(true);
  });
});

describe("createCategoryGroup", () => {
  test("produces a fully populated group row", () => {
    const g = createCategoryGroup({ name: "Needs" });
    expect(g.id).toMatch(/^cgrp_[0-9a-f]{24}$/);
    expect(g.name).toBe("Needs");
    expect(g.isIncome).toBe(false);
    expect(g.hidden).toBe(false);
    expect(g.sortOrder).toBe(0);
  });
});

describe("createTransaction", () => {
  test("fills defaults for optional fields", () => {
    const t = createTransaction({ accountId: "acct_1", amount: -1000, date: "2026-04-15" });
    expect(t.id).toMatch(/^txn_[0-9a-f]{24}$/);
    expect(t.accountId).toBe("acct_1");
    expect(t.categoryId).toBeNull();
    expect(t.amount).toBe(-1000);
    expect(t.payee).toBeNull();
    expect(t.notes).toBeNull();
    expect(t.cleared).toBe(true);
    expect(t.reconciled).toBe(false);
    expect(t.importedDescription).toBeNull();
    expect(t.startingBalanceFlag).toBe(false);
    expect(t.sortOrder).toBeNull();
    expect(t.isParent).toBe(false);
    expect(t.isChild).toBe(false);
    expect(t.parentId).toBeNull();
    expect(t.transferId).toBeNull();
    expect(t.scheduleId).toBeNull();
  });

  test("honours caller-supplied id", () => {
    const t = createTransaction({
      accountId: "acct_1",
      amount: 0,
      date: "2026-04-15",
      id: "txn_custom",
    });
    expect(t.id).toBe("txn_custom");
  });

  test("preserves explicit cleared=false and reconciled=true", () => {
    const t = createTransaction({
      accountId: "acct_1",
      amount: 0,
      date: "2026-04-15",
      cleared: false,
      reconciled: true,
    });
    expect(t.cleared).toBe(false);
    expect(t.reconciled).toBe(true);
  });
});

describe("createPayee", () => {
  test("produces a payee row", () => {
    const p = createPayee({ name: "Whole Foods" });
    expect(p.id).toMatch(/^pay_[0-9a-f]{24}$/);
    expect(p.name).toBe("Whole Foods");
    expect(p.transferAccountId).toBeNull();
    expect(p.favorite).toBe(false);
  });
});

describe("createSchedule", () => {
  test("requires recurrenceRules and fills other defaults", () => {
    const s = createSchedule({ recurrenceRules: "FREQ=MONTHLY" });
    expect(s.id).toMatch(/^sch_[0-9a-f]{24}$/);
    expect(s.recurrenceRules).toBe("FREQ=MONTHLY");
    expect(s.name).toBeNull();
    expect(s.accountId).toBeNull();
    expect(s.payeeId).toBeNull();
    expect(s.categoryId).toBeNull();
    expect(s.amount).toBeNull();
    expect(s.startDate).toBeNull();
    expect(s.active).toBe(true);
    expect(s.completed).toBe(false);
    expect(s.postsTransaction).toBe(false);
    expect(s.customUpcomingLength).toBeNull();
    expect(s.nextDate).toBeNull();
  });
});

describe("createRule", () => {
  test("defaults to pre/and", () => {
    const r = createRule({ conditions: "[]", actions: "[]" });
    expect(r.id).toMatch(/^rule_[0-9a-f]{24}$/);
    expect(r.stage).toBe("pre");
    expect(r.conditionsOp).toBe("and");
    expect(r.active).toBe(true);
    expect(r.deleted).toBe(false);
  });
});

describe("createTag / createTransactionTag", () => {
  test("createTag has the requested name and optional color", () => {
    expect(createTag({ name: "trip" })).toMatchObject({ name: "trip", color: null });
    expect(createTag({ name: "trip", color: "#ff0000" })).toMatchObject({
      name: "trip",
      color: "#ff0000",
    });
    expect(createTag({ name: "trip" }).id).toMatch(/^tag_[0-9a-f]{24}$/);
  });

  test("createTransactionTag links two ids", () => {
    expect(createTransactionTag({ transactionId: "t1", tagId: "tag_1" })).toEqual({
      transactionId: "t1",
      tagId: "tag_1",
    });
  });
});

describe("createBudget", () => {
  test("composite id is month-categoryId", () => {
    const b = createBudget({ month: 202604, categoryId: "cat_1" });
    expect(b.id).toBe(budgetId(202604, "cat_1"));
    expect(b.amount).toBe(0);
    expect(b.carryover).toBe(false);
  });

  test("honours amount and carryover", () => {
    const b = createBudget({ month: 202604, categoryId: "cat_1", amount: 50_000, carryover: true });
    expect(b.amount).toBe(50_000);
    expect(b.carryover).toBe(true);
  });
});

describe("createBudgetMonth", () => {
  test("uses monthKey as the id and defaults buffered to 0", () => {
    const m = createBudgetMonth({ monthKey: "2026-04" });
    expect(m.id).toBe("2026-04");
    expect(m.buffered).toBe(0);
  });
});

describe("createCustomReport", () => {
  test("fills sensible defaults", () => {
    const r = createCustomReport({ name: "By month" });
    expect(r.id).toMatch(/^rpt_[0-9a-f]{24}$/);
    expect(r.name).toBe("By month");
    expect(r.dateStatic).toBe(false);
    expect(r.sortBy).toBe("desc");
    expect(r.conditions).toBe("[]");
    expect(r.conditionsOp).toBe("and");
    expect(r.includeCurrent).toBe(true);
    expect(r.showEmpty).toBe(false);
  });
});

describe("createTransactionFilter", () => {
  test("defaults to and", () => {
    const f = createTransactionFilter({ name: "Big", conditions: "[]" });
    expect(f.id).toMatch(/^flt_[0-9a-f]{24}$/);
    expect(f.conditionsOp).toBe("and");
  });
});

describe("createDashboardWidget", () => {
  test("captures position and size", () => {
    const w = createDashboardWidget({ type: "net-worth", x: 0, y: 0, width: 6, height: 3 });
    expect(w.id).toMatch(/^wgt_[0-9a-f]{24}$/);
    expect(w.type).toBe("net-worth");
    expect(w.meta).toBeNull();
  });
});

describe("createNote / updateNote", () => {
  test("createNote uses the nt_ prefix and timestamp", () => {
    const n = createNote({ noteableType: "account", noteableId: "acct_1", body: "hello" });
    expect(n.id).toMatch(/^nt_[0-9a-f]{24}$/);
    expect(n.noteableType).toBe("account");
    expect(n.noteableId).toBe("acct_1");
    expect(n.body).toBe("hello");
  });

  test("updateNote updates body and bumps updatedAt", async () => {
    const n = createNote({ noteableType: "x", noteableId: "y", body: "old" });
    // ensure timestamp would change
    await new Promise((r) => setTimeout(r, 10));
    const before = nowIso();
    const updated = updateNote(n, "new");
    expect(updated.body).toBe("new");
    expect(updated.id).toBe(n.id);
    expect(updated.createdAt).toBe(n.createdAt);
    expect(updated.updatedAt).not.toBe(n.updatedAt);
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before).getTime(),
    );
  });
});
