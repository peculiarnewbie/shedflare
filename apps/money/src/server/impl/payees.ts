import { sql } from "drizzle-orm";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, payeesGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { PayeesResponseSchema, PayeeSuggestionsResponseSchema } from "../../domain/schemas";

type Env = { MONEY_DB: D1Database };

export function createPayeesGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "payees", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db.all<{
          id: string;
          name: string;
          transfer_account_id: string | null;
          favorite: number;
          created_at: string;
          updated_at: string;
          transaction_count: number;
        }>(
          sql`SELECT p.*, (SELECT COUNT(*) FROM transactions WHERE payee = p.name) as transaction_count
           FROM payees p ORDER BY p.name`,
        );
        return validatedJson(PayeesResponseSchema, {
          payees: rows.map((r) => ({
            id: r.id,
            name: r.name,
            transferAccountId: r.transfer_account_id,
            favorite: r.favorite === 1,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            transaction_count: Number(r.transaction_count),
          })),
        });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("suggestions", {
      endpoint: endpoints["suggestions"],
      handler: wrapHandler(async (req: Request): Promise<Response> => {
        const url = new URL(req.url);
        const payeeName = url.searchParams.get("payee");
        if (!payeeName) return validatedJson(PayeeSuggestionsResponseSchema, { suggestions: [] });
        const db = createDb(env.MONEY_DB);
        const rows = await db.all<{
          category_id: string;
          category_name: string;
          group_name: string | null;
          count: number;
        }>(
          sql`SELECT t.category_id, c.name AS category_name, cg.name AS group_name, COUNT(*) AS count
           FROM transactions t
           LEFT JOIN categories c ON t.category_id = c.id
           LEFT JOIN category_groups cg ON c.group_id = cg.id
           WHERE t.payee = ${payeeName} AND t.category_id IS NOT NULL AND t.is_child = 0
           GROUP BY t.category_id ORDER BY count DESC LIMIT 5`,
        );
        return validatedJson(PayeeSuggestionsResponseSchema, { suggestions: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    return handlers;
  });
}
