import { eq, sql, and, type SQL } from "drizzle-orm";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, transactionsGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import { TransactionsResponseSchema } from "../../domain/schemas";
import * as s from "../../db/schema";
import { buildFilterSql } from "../conditions-to-sql";
import type { FilterCondition } from "../conditions-to-sql";

type Env = { MONEY_DB: D1Database };

export function createTransactionsGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "transactions", (handlers: any) => {
    handlers.handlers.set("list", {
      endpoint: endpoints["list"],
      handler: wrapHandler(async (req: Request): Promise<Response> => {
        const url = new URL(req.url);
        const filterId = url.searchParams.get("filter");
        const db = createDb(env.MONEY_DB);

        let whereClause: any = undefined;
        if (filterId) {
          const [filterRow] = await db
            .select()
            .from(s.transactionFilters)
            .where(eq(s.transactionFilters.id, filterId))
            .all();
          if (filterRow) {
            const conditions = JSON.parse((filterRow.conditions as string) ?? "[]") as FilterCondition[];
            const conditionsOp = (filterRow.conditionsOp as string) ?? "and";
            const filterSql = buildFilterSql(conditions, conditionsOp as "and" | "or");
            if (filterSql) whereClause = filterSql;
          }
        }

        const query = db
          .select({
            id: s.transactions.id, accountId: s.transactions.accountId,
            categoryId: s.transactions.categoryId, amount: s.transactions.amount,
            payee: s.transactions.payee, notes: s.transactions.notes,
            date: s.transactions.date, cleared: s.transactions.cleared,
            reconciled: s.transactions.reconciled,
            importedDescription: s.transactions.importedDescription,
            startingBalanceFlag: s.transactions.startingBalanceFlag,
            sortOrder: s.transactions.sortOrder, isParent: s.transactions.isParent,
            isChild: s.transactions.isChild, parentId: s.transactions.parentId,
            transferId: s.transactions.transferId, scheduleId: s.transactions.scheduleId,
            createdAt: s.transactions.createdAt, updatedAt: s.transactions.updatedAt,
            categoryName: s.categories.name, accountName: s.accounts.name,
            scheduleName: s.schedules.name,
          })
          .from(s.transactions)
          .leftJoin(s.categories, eq(s.transactions.categoryId, s.categories.id))
          .leftJoin(s.accounts, eq(s.transactions.accountId, s.accounts.id))
          .leftJoin(s.schedules, eq(s.transactions.scheduleId, s.schedules.id))
          .orderBy(sql`${s.transactions.date} DESC, ${s.transactions.createdAt} DESC`);
        if (whereClause) query.where(whereClause);
        const rows = await query.all();
        return validatedJson(TransactionsResponseSchema, { transactions: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });
    return handlers;
  });
}
