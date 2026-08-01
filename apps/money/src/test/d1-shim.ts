import { join } from "node:path";
import { createD1Shim, D1Shim } from "@shedflare/test-utils/d1-shim";
import { applyDrizzleMigrations } from "@shedflare/test-utils/migrations";

export { D1Shim, createD1Shim };

const MIGRATIONS_DIR = join(import.meta.dirname, "../migrations");

export function createMoneyTestD1(): D1Shim {
  const d1 = createD1Shim();
  d1.exec("PRAGMA foreign_keys = OFF");
  applyDrizzleMigrations(d1, MIGRATIONS_DIR);
  d1.exec(
    `INSERT OR IGNORE INTO exchange_rates (id, usd_to_idr, updated_at) VALUES ('latest', 16000, '${new Date().toISOString()}')`,
  );
  return d1;
}
