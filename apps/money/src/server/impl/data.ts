import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi } from "../definitions";
import { createDb, rawD1Query } from "../d1-access";
import { wrapHandler } from "./wrap-handler";

type Env = { MONEY_DB: D1Database };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createDataGroup(env: Env) {
  return HttpApiBuilder.group(moneyApi, "data", (handlers) =>
    handlers.handleRaw(
      "dump",
      wrapHandler(async (_req: Request): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const data: Record<string, Record<string, unknown>> = {};

        const tables = [
          "accounts",
          "transactions",
          "categories",
          "category_groups",
          "payees",
          "schedules",
          "rules",
          "tags",
          "transaction_tags",
          "budgets",
          "budget_months",
          "custom_reports",
          "dashboard_widgets",
          "exchange_rates",
          "settings",
          "notes",
          "transaction_filters",
        ];

        for (const name of tables) {
          try {
            const rows = await db.all<{ id?: string; key?: string } & Record<string, unknown>>(
              rawD1Query(`SELECT * FROM ${name}`),
            );
            data[name] = {};
            for (const row of rows) {
              const id = row.id ?? row.key ?? null;
              if (id) data[name][String(id)] = row;
            }
          } catch (e) {
            console.warn(
              "[data] dump skipping table",
              name,
              e instanceof Error ? e.message : String(e),
            );
          }
        }

        return json({ data });
      }),
    ),
  );
}
