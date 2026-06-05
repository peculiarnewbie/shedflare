import { eq } from "drizzle-orm";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, ratesGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { RatesResponseSchema } from "../../domain/schemas";
import * as s from "../../db/schema";

type Env = { MONEY_DB: D1Database };

export function createRatesGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "rates", (handlers: any) => {
    handlers.handlers.set("get", {
      endpoint: endpoints["get"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const [row] = await db
          .select()
          .from(s.exchangeRates)
          .where(eq(s.exchangeRates.id, "latest"))
          .all();
        return validatedJson(
          RatesResponseSchema,
          row
            ? { id: row.id, usdToIdr: row.usdToIdr, updatedAt: row.updatedAt }
            : { id: "latest", usdToIdr: 16000, updatedAt: new Date().toISOString() },
        );
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
