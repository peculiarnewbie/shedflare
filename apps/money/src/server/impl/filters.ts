import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { FiltersResponseSchema } from "../../domain/schemas";
import * as s from "../../db/schema";

type Env = { MONEY_DB: D1Database };

export function createFiltersGroup(env: Env) {
  return HttpApiBuilder.group(moneyApi, "filters", (handlers) =>
    handlers.handleRaw(
      "list",
      wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db
          .select()
          .from(s.transactionFilters)
          .orderBy(s.transactionFilters.name)
          .all();
        return validatedJson(FiltersResponseSchema, { filters: rows });
      }),
    ),
  );
}
