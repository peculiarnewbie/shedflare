import { join } from "node:path";
import { applyDrizzleMigrations } from "@shedflare/test-utils/migrations";
import { D1Shim, createD1Shim } from "@shedflare/test-utils/d1-shim";

export { D1Shim, createD1Shim };

export function asD1Database(shim: D1Shim): D1Database {
  // SAFETY: The published shim implements the D1 methods Drizzle exercises in these tests.
  return shim as D1Shim & D1Database;
}

const MIGRATIONS_DIR = join(import.meta.dirname, "../migrations");

export function createTestD1(): D1Shim {
  const d1 = createD1Shim();
  applyDrizzleMigrations(d1, MIGRATIONS_DIR);
  return d1;
}
