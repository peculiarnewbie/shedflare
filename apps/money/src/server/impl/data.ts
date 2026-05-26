import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { createDrizzleDb } from "../d1-access";
import { wrapHandler } from "./wrap-handler";
import * as schema from "../../db/schema";

type Env = { MONEY_DB: D1Database };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createDataGroup(env: Env) {
  const endpoints = (moneyApi as any).groups["data"].endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "data", (handlers: any) => {
    handlers.handlers.set("dump", {
      endpoint: endpoints["dump"],
      handler: wrapHandler(async (_req: Request): Promise<Response> => {
        const drizzle = createDrizzleDb(env.MONEY_DB);
        const tableNames = Object.keys(schema);
        const data: Record<string, Record<string, unknown>> = {};

        for (const name of tableNames) {
          const tableDef = (schema as any)[name];
          if (!tableDef || !tableDef._meta) continue;
          try {
            const rows = (await drizzle.select().from(tableDef).all()) as Record<string, unknown>[];
            data[name] = {};
            for (const row of rows) {
              const id = (row as any).id ?? (row as any).key ?? null;
              if (id) data[name][String(id)] = row;
            }
          } catch {
            // Skip tables that don't exist or can't be queried
          }
        }

        return json({ data });
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
