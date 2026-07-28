import { drizzle } from "drizzle-orm/d1";

export function db(database: D1Database) {
  return drizzle(database);
}

export type Database = ReturnType<typeof db>;
