import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, settingsGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { SettingsResponseSchema } from "../../domain/schemas";
import * as s from "../../db/schema";

type Env = { MONEY_DB: D1Database };

export function createSettingsGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "settings", (handlers: any) => {
    handlers.handlers.set("get", {
      endpoint: endpoints["get"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db.select().from(s.settings).all();
        return validatedJson(SettingsResponseSchema, { settings: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
