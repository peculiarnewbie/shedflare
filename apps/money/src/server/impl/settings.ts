import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { SettingsResponseSchema } from "../../domain/schemas";
import * as s from "../../db/schema";

type Env = { MONEY_DB: D1Database };

export function createSettingsGroup(env: Env) {
  return HttpApiBuilder.group(moneyApi, "settings", (handlers) =>
    handlers.handleRaw(
      "get",
      wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db.select().from(s.settings).all();
        return validatedJson(SettingsResponseSchema, { settings: rows });
      }),
    ),
  );
}
