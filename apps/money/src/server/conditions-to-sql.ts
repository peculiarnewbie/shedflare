import { and, or, sql, type SQL } from "drizzle-orm";
import { SQLiteDialect } from "drizzle-orm/sqlite-core";

// ── Discriminated union: only valid operator/value combos are representable ──

export interface IsCondition {
  field: string;
  op: "is";
  value: string | number | boolean;
}

export interface IsNotCondition {
  field: string;
  op: "isNot";
  value: string | number;
}

export interface ContainsCondition {
  field: string;
  op: "contains";
  value: string;
}

export interface DoesNotContainCondition {
  field: string;
  op: "doesNotContain";
  value: string;
}

export interface NumericCondition {
  field: string;
  op: "gt" | "gte" | "lt" | "lte";
  value: number;
}

export interface OneOfCondition {
  field: string;
  op: "oneOf";
  value: Array<string | number>;
}

export interface IsBetweenCondition {
  field: string;
  op: "isbetween";
  value: number;
  value2: number;
}

export type FilterCondition =
  | IsCondition
  | IsNotCondition
  | ContainsCondition
  | DoesNotContainCondition
  | NumericCondition
  | OneOfCondition
  | IsBetweenCondition;

function colRef(field: string): SQL {
  switch (field) {
    case "account":
      return sql`t.account_id`;
    case "category":
      return sql`t.category_id`;
    case "amount":
      return sql`t.amount`;
    case "date":
      return sql`t.date`;
    case "notes":
      return sql`t.notes`;
    case "cleared":
      return sql`t.cleared`;
    case "reconciled":
      return sql`t.reconciled`;
    default:
      throw new Error(`Unknown filter field: ${field}`);
  }
}

function conditionToSql(cond: FilterCondition): SQL {
  const col = colRef(cond.field);

  switch (cond.op) {
    case "is": {
      if (cond.field === "cleared" || cond.field === "reconciled") {
        return sql`${col} = ${cond.value ? 1 : 0}`;
      }
      return sql`${col} = ${cond.value}`;
    }
    case "isNot":
      return sql`${col} != ${cond.value}`;
    case "contains":
      return sql`${col} LIKE ${"%" + cond.value + "%"}`;
    case "doesNotContain":
      return sql`${col} NOT LIKE ${"%" + cond.value + "%"}`;
    case "gt":
      return sql`${col} > ${cond.value}`;
    case "gte":
      return sql`${col} >= ${cond.value}`;
    case "lt":
      return sql`${col} < ${cond.value}`;
    case "lte":
      return sql`${col} <= ${cond.value}`;
    case "oneOf": {
      const arr = cond.value;
      return sql`${col} IN (${sql.join(
        arr.map((v) => sql`${v}`),
        sql`, `,
      )})`;
    }
    case "isbetween":
      return sql`${col} >= ${cond.value} AND ${col} <= ${cond.value2}`;
  }
}

/** Build a Drizzle SQL object for use within typed query builders. */
export function buildFilterSql(
  conditions: FilterCondition[],
  conditionsOp: "and" | "or",
): SQL | null {
  if (conditions.length === 0) return null;
  const fragments = conditions.map(conditionToSql);
  if (fragments.length === 0) return null;
  return (conditionsOp === "or" ? or(...fragments) : and(...fragments)) as SQL<unknown>;
}

/** Build raw SQL string + params for use with db.all/get/run. */
export function buildFilterWhereSql(
  conditions: FilterCondition[],
  conditionsOp: "and" | "or",
): { whereClause: string; params: unknown[] } {
  const sqlObj = buildFilterSql(conditions, conditionsOp);
  if (!sqlObj) return { whereClause: "", params: [] };
  const built = new SQLiteDialect().sqlToQuery(sqlObj);
  return { whereClause: built.sql, params: built.params };
}
