/**
 * D1 database access layer — thin wrappers with type casts for Workers types quirks.
 */

import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export function queryOne<T extends Record<string, unknown>>(
  db: D1Database,
  query: string,
  ...params: unknown[]
): T | null {
  return (db.prepare(query).bind(...params) as any).first() as T | null;
}

export function queryAll<T extends Record<string, unknown>>(
  db: D1Database,
  query: string,
  ...params: unknown[]
): T[] {
  return (db.prepare(query).bind(...params) as any).all().results as T[];
}

export function exec(db: D1Database, query: string, ...params: unknown[]) {
  return (db.prepare(query).bind(...params) as any).run() as D1Result;
}

export function createDrizzleDb(db: D1Database): DrizzleD1Database<typeof schema> {
  return db as any;
}
