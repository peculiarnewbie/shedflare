export { D1Shim, asD1Database, createD1Shim } from "@shedflare/test-utils/d1-shim";

import { join } from "node:path";
import { applyDrizzleMigrations } from "@shedflare/test-utils/migrations";
import { D1Shim, createD1Shim } from "@shedflare/test-utils/d1-shim";

const MIGRATIONS_DIR = join(import.meta.dirname, "../migrations");

export function createTestD1(): D1Shim {
  const d1 = createD1Shim();
  applyDrizzleMigrations(d1, MIGRATIONS_DIR);
  return d1;
}
