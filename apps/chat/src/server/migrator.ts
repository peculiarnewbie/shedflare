import { migrate } from "drizzle-orm/effect-sqlite-do/migrator";
import type { ChatDrizzleDatabase } from "./effect-database";

export type MigrationManifest = Record<string, string>;

const MIGRATIONS_TABLE = "__drizzle_migrations";

function parseMigrationFolderMillis(name: string): number {
  const timestamp = name.slice(0, 14);
  return Date.UTC(
    Number(timestamp.slice(0, 4)),
    Number(timestamp.slice(4, 6)) - 1,
    Number(timestamp.slice(6, 8)),
    Number(timestamp.slice(8, 10)),
    Number(timestamp.slice(10, 12)),
    Number(timestamp.slice(12, 14)),
  );
}

function makeIdempotent(migrationSql: string): string {
  return migrationSql
    .replace(/CREATE TABLE(?! IF NOT EXISTS)\s+/gi, "CREATE TABLE IF NOT EXISTS ")
    .replace(/CREATE INDEX(?! IF NOT EXISTS)\s+/gi, "CREATE INDEX IF NOT EXISTS ");
}

function tableExists(sql: SqlStorage, tableName: string): boolean {
  return (
    [...sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", tableName)]
      .length > 0
  );
}

function tableColumns(sql: SqlStorage, tableName: string): Set<string> {
  return new Set(
    [...sql.exec(`PRAGMA table_info(${tableName})`)]
      .map((row) => row.name)
      .filter((name): name is string => typeof name === "string"),
  );
}

/**
 * One-time bridge for databases created before migration tracking existed.
 * New and already-migrated databases go directly through Drizzle's Effect
 * migrator below.
 */
function repairLegacyDatabase(storage: DurableObjectStorage, migrations: MigrationManifest): void {
  const sql = storage.sql;
  if (tableExists(sql, MIGRATIONS_TABLE) || !tableExists(sql, "workspaces")) return;

  const initialMigrationName = Object.keys(migrations).sort()[0];
  if (!initialMigrationName) return;

  storage.transactionSync(() => {
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

    for (const repair of repairs) {
      if (tableExists(sql, repair.table) && !tableColumns(sql, repair.table).has(repair.column)) {
        sql.exec(repair.ddl);
      }
    }

    const statements = makeIdempotent(migrations[initialMigrationName]!)
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) sql.exec(statement);

    sql.exec(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id INTEGER PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric,
        name text,
        applied_at TEXT
      )`,
    );
    sql.exec(
      `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at, name, applied_at)
       VALUES (?, ?, ?, ?)`,
      "",
      parseMigrationFolderMillis(initialMigrationName),
      initialMigrationName,
      new Date().toISOString(),
    );
  });
}

/** Uses Drizzle's Effect-native Durable Object migrator for normal upgrades. */
export function runMigrations(
  db: ChatDrizzleDatabase,
  storage: DurableObjectStorage,
  migrations: MigrationManifest,
) {
  repairLegacyDatabase(storage, migrations);
  return migrate(db, { migrations });
}
