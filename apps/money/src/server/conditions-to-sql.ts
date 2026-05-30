import { and, or, sql, type SQL } from "drizzle-orm";

export interface FilterCondition {
  field: string;
  op: string;
  value: unknown;
  value2?: unknown;
}

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

function conditionToSql(cond: FilterCondition): SQL | null {
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
      return sql`${col} LIKE ${"%" + String(cond.value) + "%"}`;
    case "doesNotContain":
      return sql`${col} NOT LIKE ${"%" + String(cond.value) + "%"}`;
    case "gt":
      return sql`${col} > ${cond.value}`;
    case "gte":
      return sql`${col} >= ${cond.value}`;
    case "lt":
      return sql`${col} < ${cond.value}`;
    case "lte":
      return sql`${col} <= ${cond.value}`;
    case "oneOf": {
      const arr = (cond.value as unknown[]) ?? [];
      return sql`${col} IN (${sql.join(
        arr.map((v) => sql`${v}`),
        sql`, `,
      )})`;
    }
    case "isbetween":
      return sql`${col} >= ${cond.value} AND ${col} <= ${cond.value2}`;
    default:
      console.warn("[filters] unhandled filter operator", cond.op);
      return null;
  }
}

/** Build a Drizzle SQL object for use within typed query builders. */
export function buildFilterSql(
  conditions: FilterCondition[],
  conditionsOp: "and" | "or",
): SQL | null {
  if (conditions.length === 0) return null;
  const fragments = conditions.map(conditionToSql).filter((x): x is SQL => x !== null);
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
  const built = (sqlObj as any).toSQL();
  return { whereClause: built.sql, params: built.params };
}
