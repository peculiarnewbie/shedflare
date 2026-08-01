import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface SqlExecutor {
  exec(sql: string): void;
}

export function readDrizzleMigrationStatements(migrationsDir: string): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap(({ name }) => {
      const migrationPath = join(migrationsDir, name, "migration.sql");
      if (!existsSync(migrationPath)) return [];

      return readFileSync(migrationPath, "utf8")
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
    });
}

export function applyDrizzleMigrations(executor: SqlExecutor, migrationsDir: string): void {
  for (const statement of readDrizzleMigrationStatements(migrationsDir)) executor.exec(statement);
}
