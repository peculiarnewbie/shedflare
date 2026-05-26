import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { DataAccess } from "../data-access";
import { createDrizzleDb } from "../d1-access";
import { handleApiRequest } from "../api-handlers";
import { wrapHandler } from "./wrap-handler";

type Env = { MONEY_DB: D1Database };

export function createExportGroup(env: Env) {
  const endpoints = (moneyApi as any).groups["export"].endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "export", (handlers: any) => {
    handlers.handlers.set("csv", {
      endpoint: endpoints["csv"],
      handler: wrapHandler(async (req: Request): Promise<Response> => {
        const url = new URL(req.url);
        const drizzle = createDrizzleDb(env.MONEY_DB);
        const access = new DataAccess(env.MONEY_DB, drizzle);
        return (
          handleApiRequest(url, req.method, access) ?? new Response("Not found", { status: 404 })
        );
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
