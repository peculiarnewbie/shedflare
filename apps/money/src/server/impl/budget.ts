import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { DataAccess } from "../data-access";
import { createDrizzleDb } from "../d1-access";
import { handleApiRequest } from "../api-handlers";
import { wrapHandler } from "./wrap-handler";

type Env = { MONEY_DB: D1Database };

export function createBudgetGroup(env: Env) {
  const endpoints = (moneyApi as any).groups["budget"].endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "budget", (handlers: any) => {
    const handler = wrapHandler(async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      const drizzle = createDrizzleDb(env.MONEY_DB);
      const access = new DataAccess(env.MONEY_DB, drizzle);
      return (
        handleApiRequest(url, req.method, access) ?? new Response("Not found", { status: 404 })
      );
    });
    for (const name of Object.keys(endpoints)) {
      handlers.handlers.set(name, {
        endpoint: endpoints[name],
        handler,
        isRaw: true,
        uninterruptible: false,
      });
    }
    return handlers;
  });
}
