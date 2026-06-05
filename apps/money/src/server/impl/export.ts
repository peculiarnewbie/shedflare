import { sql } from "drizzle-orm";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, exportGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler } from "./wrap-handler";

type Env = { MONEY_DB: D1Database };

export function createExportGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "export", (handlers: any) => {
    handlers.handlers.set("csv", {
      endpoint: endpoints["csv"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db.all<{
          date: string; amount: number; payee: string | null;
          category: string | null; notes: string | null; account: string;
        }>(
          sql`SELECT t.date, t.amount, t.payee, c.name as category,
                  t.notes, a.name as account
           FROM transactions t
           LEFT JOIN categories c ON t.category_id = c.id
           LEFT JOIN accounts a ON t.account_id = a.id
           ORDER BY t.date DESC`,
        );
        const header = "Date,Amount,Payee,Category,Notes,Account\n";
        const csvLines = rows.map((r) =>
          [r.date, Number(r.amount ?? 0) / 100, `"${r.payee ?? ""}"`,
           `"${r.category ?? ""}"`, `"${r.notes ?? ""}"`, `"${r.account ?? ""}"`].join(","),
        );
        return new Response(header + csvLines.join("\n"), {
          headers: {
            "content-type": "text/csv",
            "content-disposition": 'attachment; filename="shedflare-export.csv"',
          },
        });
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
