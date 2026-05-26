import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { DataAccess } from "../data-access";
import { createDrizzleDb } from "../d1-access";
import { wrapHandler } from "./wrap-handler";

type Env = { MONEY_DB: D1Database };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createSettingsGroup(env: Env) {
  const endpoints = (moneyApi as any).groups["settings"].endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "settings", (handlers: any) => {
    handlers.handlers.set("get", {
      endpoint: endpoints["get"],
      handler: wrapHandler(async (_req: Request): Promise<Response> => {
        const drizzle = createDrizzleDb(env.MONEY_DB);
        const access = new DataAccess(env.MONEY_DB, drizzle);
        const rows = access.queryAll<Record<string, unknown>>(
          "SELECT * FROM settings ORDER BY key",
        );
        return json({ settings: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
