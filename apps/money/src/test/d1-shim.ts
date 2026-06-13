import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createD1Shim, D1Shim } from "@shedflare/test-utils/d1-shim";

export { D1Shim, createD1Shim };

const MIGRATIONS_DIR = join(fileURLToPath(import.meta.url), "../../migrations");

let cachedMigrationSql: string[] | null = null;

function getMigrationStatements(): string[] {
  if (cachedMigrationSql) return cachedMigrationSql;
  const dirs = readdirSync(MIGRATIONS_DIR).sort();
  const allSql: string[] = [];
  for (const dir of dirs) {
    const sqlPath = join(MIGRATIONS_DIR, dir, "migration.sql");
    try {
      const raw = readFileSync(sqlPath, "utf8");
      const stmts = raw
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      allSql.push(...stmts);
    } catch {
      // skip directories without migration.sql
    }
  }
  cachedMigrationSql = allSql;
  return cachedMigrationSql;
}

export function createMoneyTestD1(): D1Shim {
  const d1 = createD1Shim();
  d1.exec("PRAGMA foreign_keys = OFF");
  for (const stmt of getMigrationStatements()) {
    d1.exec(stmt);
  }
  d1.exec(
    `INSERT OR IGNORE INTO exchange_rates (id, usd_to_idr, updated_at) VALUES ('latest', 16000, '${new Date().toISOString()}')`,
  );
  return d1;
}
