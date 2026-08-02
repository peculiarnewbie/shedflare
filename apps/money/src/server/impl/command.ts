import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { createDb } from "../d1-access";
import { handleCommand } from "../command-handlers";
import { wrapHandler } from "./wrap-handler";

type Env = { MONEY_DB: D1Database };

export function createCommandGroup(env: Env) {
  return HttpApiBuilder.group(moneyApi, "command", (handlers) =>
    handlers.handleRaw(
      "execute",
      wrapHandler(async (req: Request): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const body = (await req.json()) as Record<string, unknown>;
        const result = await handleCommand(db, body);
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { "content-type": "application/json" },
        });
      }),
    ),
  );
}
