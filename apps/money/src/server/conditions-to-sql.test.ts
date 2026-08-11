import { describe, expect, test } from "vite-plus/test";
import { type FilterCondition, buildFilterSql, buildFilterWhereSql } from "./conditions-to-sql";

describe("buildFilterSql", () => {
  test("returns null for empty conditions", () => {
    expect(buildFilterSql([], "and")).toBeNull();
    expect(buildFilterSql([], "or")).toBeNull();
  });

  test("throws on an unknown field", () => {
    expect(() => buildFilterSql([{ field: "mystery", op: "is", value: "x" }], "and")).toThrow(
      "Unknown filter field: mystery",
    );
  });

  test("returns a SQL object for valid input", () => {
    const sql = buildFilterSql([{ field: "cleared", op: "is", value: true }], "and");
    expect(sql).not.toBeNull();
  });
});

describe("buildFilterWhereSql", () => {
  test("returns empty clause and params for empty conditions", () => {
    expect(buildFilterWhereSql([], "and")).toEqual({ whereClause: "", params: [] });
  });

  test("'is' on cleared coerces value to 0/1", () => {
    const { whereClause, params } = buildFilterWhereSql(
      [{ field: "cleared", op: "is", value: true }],
      "and",
    );
    expect(whereClause).toContain("t.cleared = ?");
    expect(params).toEqual([1]);
  });

  test("'is' on cleared with false coerces to 0", () => {
    const { params } = buildFilterWhereSql([{ field: "cleared", op: "is", value: false }], "and");
    expect(params).toEqual([0]);
  });

  test("'is' on amount emits the raw value as a parameter", () => {
    const { whereClause, params } = buildFilterWhereSql(
      [{ field: "amount", op: "is", value: 1234 }],
      "and",
    );
    expect(whereClause).toContain("t.amount = ?");
    expect(params).toEqual([1234]);
  });

  test("'isNot' uses != operator and parameterises the value", () => {
    const { whereClause, params } = buildFilterWhereSql(
      [{ field: "account", op: "isNot", value: "acct_1" }],
      "and",
    );
    expect(whereClause).toContain("t.account_id != ?");
    expect(params).toEqual(["acct_1"]);
  });

  test("'contains' wraps value in % wildcards", () => {
    const { whereClause, params } = buildFilterWhereSql(
      [{ field: "notes", op: "contains", value: "coffee" }],
      "and",
    );
    expect(whereClause).toContain("t.notes LIKE ?");
    expect(params).toEqual(["%coffee%"]);
  });

  test("payee filters target the payee column", () => {
    const { whereClause, params } = buildFilterWhereSql(
      [{ field: "payee", op: "contains", value: "market" }],
      "and",
    );
    expect(whereClause).toContain("t.payee LIKE ?");
    expect(params).toEqual(["%market%"]);
  });

  test("'doesNotContain' uses NOT LIKE with % wildcards", () => {
    const { whereClause, params } = buildFilterWhereSql(
      [{ field: "notes", op: "doesNotContain", value: "tea" }],
      "and",
    );
    expect(whereClause).toContain("t.notes NOT LIKE ?");
    expect(params).toEqual(["%tea%"]);
  });

  test("numeric operators map to < <= > >=", () => {
    for (const [op, sym] of [
      ["gt", ">"],
      ["gte", ">="],
      ["lt", "<"],
      ["lte", "<="],
    ] as const) {
      const { whereClause, params } = buildFilterWhereSql(
        [{ field: "amount", op, value: 100 }],
        "and",
      );
      expect(whereClause).toContain(`t.amount ${sym} ?`);
      expect(params).toEqual([100]);
    }
  });

  test("'oneOf' emits an IN clause with one placeholder per value", () => {
    const { whereClause, params } = buildFilterWhereSql(
      [{ field: "account", op: "oneOf", value: ["a", "b", "c"] }],
      "and",
    );
    expect(whereClause).toMatch(/t\.account_id IN \(\?, \?, \?\)/);
    expect(params).toEqual(["a", "b", "c"]);
  });

  test("'isbetween' emits a >= AND <= compound with two placeholders", () => {
    const { whereClause, params } = buildFilterWhereSql(
      [{ field: "amount", op: "isbetween", value: 100, value2: 500 }],
      "and",
    );
    expect(whereClause).toMatch(/t\.amount >= \? AND t\.amount <= \?/);
    expect(params).toEqual([100, 500]);
  });

  test("multiple conditions are joined with AND by default", () => {
    const { whereClause, params } = buildFilterWhereSql(
      [
        { field: "cleared", op: "is", value: true },
        { field: "amount", op: "gt", value: 0 },
      ],
      "and",
    );
    expect(whereClause).toMatch(/\band\b/i);
    expect(whereClause).toContain("= ?");
    expect(whereClause).toContain("> ?");
    expect(params).toEqual([1, 0]);
  });

  test("multiple conditions are joined with OR when conditionsOp='or'", () => {
    const { whereClause } = buildFilterWhereSql(
      [
        { field: "cleared", op: "is", value: true },
        { field: "amount", op: "gt", value: 0 },
      ],
      "or",
    );
    expect(whereClause).toMatch(/\bor\b/i);
  });

  test("unknown field throws even when going through the raw builder", () => {
    expect(() => buildFilterWhereSql([{ field: "mystery", op: "is", value: "x" }], "and")).toThrow(
      "Unknown filter field: mystery",
    );
  });
});

describe("condition column references", () => {
  test("known fields map to expected column names", () => {
    const cases: Array<[FilterCondition, RegExp]> = [
      [{ field: "account", op: "is", value: "x" }, /t\.account_id/],
      [{ field: "category", op: "is", value: "x" }, /t\.category_id/],
      [{ field: "payee", op: "is", value: "x" }, /t\.payee/],
      [{ field: "amount", op: "is", value: 0 }, /t\.amount/],
      [{ field: "date", op: "is", value: "x" }, /t\.date/],
      [{ field: "notes", op: "is", value: "x" }, /t\.notes/],
      [{ field: "cleared", op: "is", value: true }, /t\.cleared/],
      [{ field: "reconciled", op: "is", value: true }, /t\.reconciled/],
    ];
    for (const [cond, re] of cases) {
      const { whereClause } = buildFilterWhereSql([cond], "and");
      expect(whereClause).toMatch(re);
    }
  });
});
