import { createD1Shim, D1Shim } from "@shedflare/test-utils/d1-shim";
import { initializeStorage } from "../server/schema";

export { D1Shim, createD1Shim };

/**
 * Build a D1-shaped in-memory store pre-initialised with the money schema
 * (every table that lives in the D1 database, plus a default exchange rate).
 */
export function createMoneyTestD1(): D1Shim {
  const d1 = createD1Shim();
  d1.exec("PRAGMA foreign_keys = OFF");
  initializeStorage(
    (query, ..._params) => {
      // initializeStorage only runs DDL, so params are always empty.
      // We bind manually only for the initial exchange-rate insert.
      if (_params.length > 0) {
        void d1
          .prepare(query)
          .bind(..._params)
          .run();
      } else {
        d1.exec(query);
      }
    },
    () => null,
    () => {},
  );
  return d1;
}
