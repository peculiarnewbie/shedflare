import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { createDrizzleDb } from "../d1-access";
import { handleCommand } from "../command-handlers";
import { wrapHandler } from "./wrap-handler";

type Env = { MONEY_DB: D1Database };

export function createCommandGroup(env: Env) {
  const endpoints = (moneyApi as any).groups["command"].endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "command", (handlers: any) => {
    handlers.handlers.set("execute", {
      endpoint: endpoints["execute"],
      handler: wrapHandler(async (req: Request): Promise<Response> => {
        const drizzle = createDrizzleDb(env.MONEY_DB);
        const body = (await req.json()) as Record<string, unknown>;
        const result = handleCommand(env.MONEY_DB, drizzle, body);
        if ("error" in result) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
