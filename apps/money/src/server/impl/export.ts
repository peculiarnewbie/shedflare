import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { createDb } from "../d1-access";
import { handleApiRequest } from "../api-handlers";
import { wrapHandler } from "./wrap-handler";

type Env = { MONEY_DB: D1Database };

export function createExportGroup(env: Env) {
  const endpoints = (moneyApi as any).groups["export"].endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "export", (handlers: any) => {
    const handler = wrapHandler(async (req: Request): Promise<Response> => {
      const url = new URL(req.url);
      const db = createDb(env.MONEY_DB);
      return (
        (await handleApiRequest(url, req.method, db)) ?? new Response("Not found", { status: 404 })
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
