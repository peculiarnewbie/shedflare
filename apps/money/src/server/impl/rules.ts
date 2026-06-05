import { eq } from "drizzle-orm";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, rulesGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { RulesResponseSchema } from "../../domain/schemas";
import * as s from "../../db/schema";

type Env = { MONEY_DB: D1Database };

export function createRulesGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "rules", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db
          .select()
          .from(s.rules)
          .where(eq(s.rules.deleted, false))
          .orderBy(s.rules.createdAt)
          .all();
        return validatedJson(RulesResponseSchema, { rules: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
