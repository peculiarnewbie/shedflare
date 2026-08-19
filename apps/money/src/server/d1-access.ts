import { sql } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";

export type Db = DrizzleD1Database;

/** Build the native D1 query shape accepted by Drizzle's raw-query methods. */
export function rawD1Query(sqlText: string) {
  return sql.raw(sqlText);
}

export function createDb(d1: D1Database): Db {
  return drizzle(d1);
}
