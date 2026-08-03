import type { DataAccess as SyncDataAccess } from "@shedflare/sync-protocol";
import { type EffectDatabase } from "./effect-database";

// ---------------------------------------------------------------------------
// DataAccess – bundles Drizzle + raw SQL queries for the sync engine
// ---------------------------------------------------------------------------

type SqlAccess = Pick<SyncDataAccess, "exec" | "queryOne" | "queryAll" | "getLastServerSeq">;

type DataAccessInput = {
  database: EffectDatabase;
  sql: SqlAccess;
};

/**
 * Synchronous adapter for the sync-protocol SQL capability.
 * Fixed Chat-table operations belong to ChatRepository and use Drizzle;
 * these raw methods remain only for protocol and dynamic-table boundaries.
 */
export class DataAccess {
  readonly database: EffectDatabase;
  private readonly sql: SqlAccess;

  constructor({ database, sql }: DataAccessInput) {
    this.database = database;
    this.sql = sql;
  }

  get db() {
    return this.database.drizzle;
  }

  exec(query: string, ...params: unknown[]) {
    return this.database.runSync(this.sql.exec(query, ...params));
  }

  queryOne<T extends Record<string, unknown>>(query: string, ...params: unknown[]) {
    return this.database.runSync(this.sql.queryOne<T>(query, ...params));
  }

  queryAll<T extends Record<string, unknown>>(query: string, ...params: unknown[]) {
    return this.database.runSync(this.sql.queryAll<T>(query, ...params));
  }

  getLastServerSeq() {
    return this.database.runSync(this.sql.getLastServerSeq());
  }
}
