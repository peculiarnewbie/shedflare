import { describe, expect, test } from "vite-plus/test";
import {
  SYNC_COMMAND_TYPES,
  SYNC_PROTOCOL_VERSION,
  budgetId,
  castId,
  createId,
  fromMonthInt,
  getCurrentMonthInt,
  getCurrentMonthKey,
  isSyncCommandType,
  monthBoundaries,
  nowIso,
  prevMonthKey,
  toMonthInt,
} from "./types";

describe("createId", () => {
  test("uses the requested prefix", () => {
    for (const prefix of [
      "acct",
      "txn",
      "cat",
      "cgrp",
      "pay",
      "sch",
      "rule",
      "tag",
      "rpt",
      "wgt",
      "flt",
      "nt",
    ] as const) {
      const id = createId(prefix);
      expect(id).toMatch(new RegExp(`^${prefix}_[0-9a-f]{24}$`));
    }
  });

  test("produces unique values across calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(createId("acct"));
    expect(ids.size).toBe(50);
  });
});

describe("castId", () => {
  test("returns the input string unchanged", () => {
    expect(castId<"AccountId">("acct_123")).toBe("acct_123");
  });
});

describe("month conversions", () => {
  test("toMonthInt parses YYYY-MM into YYYYMM", () => {
    expect(toMonthInt("2026-04")).toBe(202604);
    expect(toMonthInt("2026-12")).toBe(202612);
    expect(toMonthInt("2000-01")).toBe(200001);
  });

  test("fromMonthInt pads single-digit months", () => {
    expect(fromMonthInt(202604)).toBe("2026-04");
    expect(fromMonthInt(200001)).toBe("2000-01");
  });

  test("toMonthInt/fromMonthInt are inverses", () => {
    for (const mk of ["2025-01", "2026-12", "1999-09", "2030-07"]) {
      expect(fromMonthInt(toMonthInt(mk))).toBe(mk);
    }
  });

  test("monthBoundaries returns the first and last day of the month", () => {
    expect(monthBoundaries("2026-04")).toEqual({ start: "2026-04-01", end: "2026-04-30" });
    expect(monthBoundaries("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    // leap year
    expect(monthBoundaries("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthBoundaries("2026-12")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });

  test("prevMonthKey rolls over year boundary", () => {
    expect(prevMonthKey("2026-01")).toBe("2025-12");
    expect(prevMonthKey("2026-04")).toBe("2026-03");
    expect(prevMonthKey("2026-12")).toBe("2026-11");
  });
});

describe("current month helpers", () => {
  test("getCurrentMonthKey uses local year/month in YYYY-MM", () => {
    const expected = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();
    expect(getCurrentMonthKey()).toBe(expected);
  });

  test("getCurrentMonthInt matches getCurrentMonthKey", () => {
    expect(getCurrentMonthInt()).toBe(toMonthInt(getCurrentMonthKey()));
  });
});

describe("budgetId", () => {
  test("combines month and category id with a dash", () => {
    expect(budgetId(202604, "cat_1")).toBe("202604-cat_1");
  });
});

describe("nowIso", () => {
  test("returns an ISO 8601 string parseable by Date", () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });
});

describe("SYNC_PROTOCOL_VERSION", () => {
  test("is a non-empty string", () => {
    expect(typeof SYNC_PROTOCOL_VERSION).toBe("string");
    expect(SYNC_PROTOCOL_VERSION.length).toBeGreaterThan(0);
  });
});

describe("isSyncCommandType", () => {
  test("returns true for valid command types", () => {
    expect(isSyncCommandType("create_account")).toBe(true);
    expect(isSyncCommandType("update_transaction")).toBe(true);
    expect(isSyncCommandType("delete_note")).toBe(true);
  });

  test("returns false for unknown strings and non-strings", () => {
    expect(isSyncCommandType("nope")).toBe(false);
    expect(isSyncCommandType("")).toBe(false);
    expect(isSyncCommandType(123)).toBe(false);
    expect(isSyncCommandType(null)).toBe(false);
    expect(isSyncCommandType(undefined)).toBe(false);
    expect(isSyncCommandType({})).toBe(false);
  });
});

describe("SYNC_COMMAND_TYPES", () => {
  test("covers the commands referenced in commands.ts", () => {
    // sanity check: every built-in command name appears in the list
    for (const key of [
      "create_account",
      "update_transaction",
      "split_transaction",
      "set_budget_amount",
      "cover_overspending",
      "apply_goal_templates",
      "update_dashboard",
      "update_exchange_rate",
      "list_notes",
    ]) {
      expect(SYNC_COMMAND_TYPES).toContain(key);
    }
  });
});
