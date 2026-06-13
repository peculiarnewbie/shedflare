import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";

export function db(database: D1Database) {
  return drizzle(database, { schema });
}

export type Database = ReturnType<typeof db>;
