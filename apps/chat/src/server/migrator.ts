import { sql } from "drizzle-orm";
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

export type MigrationManifest = Record<string, string>;

const MIGRATIONS_TABLE = "__drizzle_migrations";

function ensureMigrationsTable<TSchema extends Record<string, unknown>>(
  db: DrizzleSqliteDODatabase<TSchema>,
): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(MIGRATIONS_TABLE)} (
      id INTEGER PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric,
      name text,
      applied_at TEXT
    )
  `);
}

function listAppliedMigrations<TSchema extends Record<string, unknown>>(
  db: DrizzleSqliteDODatabase<TSchema>,
): Array<{ name: string | null; hash: string | null }> {
  const rows = db.values(sql`SELECT name, hash FROM ${sql.identifier(MIGRATIONS_TABLE)}`) as Array<
    [unknown, unknown]
  >;
  return rows.map(([name, hash]) => ({
    name: typeof name === "string" ? name : null,
    hash: typeof hash === "string" ? hash : null,
  }));
}

function recordMigration<TSchema extends Record<string, unknown>>(
  db: DrizzleSqliteDODatabase<TSchema>,
  name: string,
  hash: string,
  createdAt: number,
): void {
  db.run(
    sql`INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} (hash, created_at, name, applied_at) VALUES (${hash}, ${createdAt}, ${name}, ${new Date().toISOString()})`,
  );
}

function parseMigrationName(name: string): {
  timestamp: number;
  folderMillis: number;
} {
  const timestamp = Number(name.slice(0, 14));
  // Drizzle's migrator treats folderMillis as the timestamp in milliseconds,
  // truncated to the nearest thousand. Match that convention.
  const stringified = String(timestamp);
  const millis = Number(stringified.substring(0, stringified.length - 3) + "000");
  return { timestamp, folderMillis: millis };
}

function tableExists<TSchema extends Record<string, unknown>>(
  db: DrizzleSqliteDODatabase<TSchema>,
  tableName: string,
): boolean {
  const rows = db.values(
    sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ${tableName}`,
  ) as Array<[number]>;
  return rows.length > 0;
}

function tableColumns<TSchema extends Record<string, unknown>>(
  db: DrizzleSqliteDODatabase<TSchema>,
  tableName: string,
): Set<string> {
  const rows = db.values(sql`PRAGMA table_info(${sql.raw(tableName)})`) as Array<
    [number, string, string, number, unknown, number]
  >;
  return new Set(rows.map(([, name]) => name));
}

/**
 * Legacy compatibility repair for Durable Objects that were created before
 * Drizzle migrations were introduced. We make the initial migration DDL
 * idempotent by injecting IF NOT EXISTS, replay it to create any missing
 * tables/indexes, then add any columns that were added incrementally by the
 * old raw-DDL bootstrap but may be missing on older DOs. This lets existing
 * chat data migrate cleanly without losing history. New DOs take the normal
 * migration path.
 */
function repairLegacySchema<TSchema extends Record<string, unknown>>(
  db: DrizzleSqliteDODatabase<TSchema>,
): void {
  const repairs: Array<{ table: string; column: string; ddl: string }> = [
    {
      table: "workspaces",
      column: "default_search_limit",
      ddl: "ALTER TABLE workspaces ADD COLUMN default_search_limit INTEGER NOT NULL DEFAULT 3",
    },
    {
      table: "threads",
      column: "forked_from_thread_id",
      ddl: "ALTER TABLE threads ADD COLUMN forked_from_thread_id TEXT",
    },
    {
      table: "threads",
      column: "forked_from_message_id",
      ddl: "ALTER TABLE threads ADD COLUMN forked_from_message_id TEXT",
    },
    {
      table: "threads",
      column: "search_enabled",
      ddl: "ALTER TABLE threads ADD COLUMN search_enabled INTEGER",
    },
    {
      table: "threads",
      column: "search_limit",
      ddl: "ALTER TABLE threads ADD COLUMN search_limit INTEGER",
    },
    {
      table: "threads",
      column: "thread_type",
      ddl: "ALTER TABLE threads ADD COLUMN thread_type TEXT",
    },
    {
      table: "threads",
      column: "comparison_group_id",
      ddl: "ALTER TABLE threads ADD COLUMN comparison_group_id TEXT",
    },
  ];

  for (const { table, column, ddl } of repairs) {
    if (tableExists(db, table) && !tableColumns(db, table).has(column)) {
      db.run(sql.raw(ddl));
    }
  }
}

function makeIdempotent(migrationSql: string): string {
  return migrationSql
    .replace(/CREATE TABLE(?! IF NOT EXISTS)\s+/gi, "CREATE TABLE IF NOT EXISTS ")
    .replace(/CREATE INDEX(?! IF NOT EXISTS)\s+/gi, "CREATE INDEX IF NOT EXISTS ");
}

function runMigrationStatements<TSchema extends Record<string, unknown>>(
  db: DrizzleSqliteDODatabase<TSchema>,
  migrationSql: string,
): void {
  const statements = migrationSql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    db.run(sql.raw(stmt));
  }
}

/**
 * Runs migrations from a manifest. Unlike Drizzle's built-in durable-sqlite
 * migrator, this surfaces the actual SQL error when a statement fails instead
 * of masking it behind a generic "Rollback" error.
 */
export function runMigrations<TSchema extends Record<string, unknown>>(
  db: DrizzleSqliteDODatabase<TSchema>,
  migrations: MigrationManifest,
): void {
  ensureMigrationsTable(db);

  const applied = listAppliedMigrations(db);
  const appliedNames = new Set(applied.map(({ name }) => name));

  // If the migrations ledger is empty but the DO already has data tables,
  // this is a legacy DO. Bring it up to the initial migration state, then
  // mark that migration as applied so future migrations run normally.
  const migrationNames = Object.keys(migrations).sort();
  const initialMigrationName = migrationNames[0];
  if (applied.length === 0 && initialMigrationName && tableExists(db, "workspaces")) {
    db.transaction((tx) => {
      // Add missing columns first; the migration's CREATE INDEX statements
      // depend on columns like threads.comparison_group_id being present.
      repairLegacySchema(tx);
      runMigrationStatements(tx, makeIdempotent(migrations[initialMigrationName]!));
      const { folderMillis } = parseMigrationName(initialMigrationName);
      recordMigration(tx, initialMigrationName, "", folderMillis);
    });
    appliedNames.add(initialMigrationName);
  }

  const pending = Object.entries(migrations)
    .filter(([name]) => !appliedNames.has(name))
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [name, migrationSql] of pending) {
    const { folderMillis } = parseMigrationName(name);

    db.transaction((tx) => {
      runMigrationStatements(tx, migrationSql);
      // Record the migration inside the same transaction so a failed
      // migration is never marked as applied.
      recordMigration(tx, name, "", folderMillis);
    });
  }
}
