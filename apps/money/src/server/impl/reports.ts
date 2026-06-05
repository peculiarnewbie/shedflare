import { eq, sql } from "drizzle-orm";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { moneyApi, reportsGroup as group } from "../definitions";
import { createDb } from "../d1-access";
import { wrapHandler, validatedJson } from "./wrap-handler";
import {
  ReportsNetWorthResponseSchema, ReportsCashFlowResponseSchema,
  ReportsSpendingResponseSchema, ReportsBudgetAnalysisResponseSchema,
  ReportsAgeOfMoneyResponseSchema, ReportsCrossoverResponseSchema,
  ReportsHeatmapResponseSchema, CustomReportsResponseSchema, CustomReportResultSchema,
} from "../../domain/schemas";
import * as s from "../../db/schema";
import {
  computeNetWorthHistory, computeCashFlow, computeSpendingByCategory,
  computeDailySpending, computeAgeOfMoney, computeCrossoverProjection, computeMonthBudget,
} from "../budget-engine";
import { buildFilterWhereSql } from "../conditions-to-sql";
import type { FilterCondition } from "../conditions-to-sql";

type Env = { MONEY_DB: D1Database };

export function createReportsGroup(env: Env) {
  const endpoints = group.endpoints;
  return (HttpApiBuilder.group as any)(moneyApi, "reports", (handlers: any) => {
    handlers.handlers.set("netWorth", {
      endpoint: endpoints["netWorth"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const history = await computeNetWorthHistory(db, 12);
        return validatedJson(ReportsNetWorthResponseSchema, {
          points: history.map((h) => ({ date: h.month, value: h.netWorth })),
        });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("cashFlow", {
      endpoint: endpoints["cashFlow"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const months = await computeCashFlow(db, 12);
        return validatedJson(ReportsCashFlowResponseSchema, { months });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("spending", {
      endpoint: endpoints["spending"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const now = new Date();
        const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        const cats = await computeSpendingByCategory(db, startDate, endDate);
        return validatedJson(ReportsSpendingResponseSchema, {
          categories: cats.map((c) => ({ label: c.categoryName, value: Math.abs(c.amount), groupName: c.groupName })),
        });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("budgetAnalysis", {
      endpoint: endpoints["budgetAnalysis"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const now = new Date();
        const monthInt = now.getFullYear() * 100 + (now.getMonth() + 1);
        const result = await computeMonthBudget(db, monthInt);
        return validatedJson(ReportsBudgetAnalysisResponseSchema, {
          categories: (result?.categories ?? []).map((c) => ({ category: c.categoryName, budgeted: c.budgeted, actual: c.spent })),
        });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("ageOfMoney", {
      endpoint: endpoints["ageOfMoney"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const days = await computeAgeOfMoney(db);
        return validatedJson(ReportsAgeOfMoneyResponseSchema, { days });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("crossover", {
      endpoint: endpoints["crossover"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const result = await computeCrossoverProjection(db);
        if (!result) return new Response(JSON.stringify({ error: "Not enough data" }), { status: 400, headers: { "content-type": "application/json" } });
        return validatedJson(ReportsCrossoverResponseSchema, result);
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("calendarHeatmap", {
      endpoint: endpoints["calendarHeatmap"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const days = await computeDailySpending(db, monthKey);
        return validatedJson(ReportsHeatmapResponseSchema, { monthKey, days });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("customList", {
      endpoint: endpoints["customList"],
      handler: wrapHandler(async (): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const rows = await db
          .select()
          .from(s.customReports)
          .orderBy(sql`${s.customReports.createdAt} DESC`)
          .all();
        return validatedJson(CustomReportsResponseSchema, { reports: rows });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    handlers.handlers.set("customExecute", {
      endpoint: endpoints["customExecute"],
      handler: wrapHandler(async (req: Request): Promise<Response> => {
        const db = createDb(env.MONEY_DB);
        const id = new URL(req.url).pathname.match(/\/api\/reports\/custom\/([^/]+)\/execute$/)?.[1];
        if (!id) return new Response(JSON.stringify({ error: "Report not found" }), { status: 404, headers: { "content-type": "application/json" } });
        const [reportRow] = await db.select().from(s.customReports).where(eq(s.customReports.id, id)).all();
        if (!reportRow) return new Response(JSON.stringify({ error: "Report not found" }), { status: 404, headers: { "content-type": "application/json" } });

        const conditions = JSON.parse((reportRow.conditions as string) ?? "[]") as FilterCondition[];
        const conditionsOp = ((reportRow.conditionsOp as string) ?? "and") as "and" | "or";
        const groupBy = (reportRow.groupBy as string) ?? null;
        const startDate = (reportRow.startDate as string) ?? null;
        const endDate = (reportRow.endDate as string) ?? null;

        let whereExtra = sql``;
        if (startDate) whereExtra = sql`${whereExtra} AND t.date >= ${startDate}`;
        if (endDate) whereExtra = sql`${whereExtra} AND t.date <= ${endDate}`;
        if (conditions.length > 0) {
          const { whereClause } = buildFilterWhereSql(conditions, conditionsOp);
          if (whereClause) whereExtra = sql`${whereExtra} AND (${sql.raw(whereClause)})`;
        }

        if (groupBy === "month") {
          const rows = await db.all<{ month: string; total: number; count: number }>(
            sql`SELECT strftime('%Y-%m', t.date) as month, SUM(t.amount) as total, COUNT(*) as count
             FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
             LEFT JOIN accounts a ON t.account_id = a.id
             WHERE 1=1${whereExtra} AND t.is_child = 0
             GROUP BY strftime('%Y-%m', t.date) ORDER BY month`,
          );
          return validatedJson(CustomReportResultSchema, { rows: rows.map((r) => ({ month: r.month, total: Number(r.total), count: Number(r.count) })), groupBy: "month" });
        }

        if (groupBy === "category") {
          const rows = await db.all<{ category: string | null; group_name: string | null; total: number; count: number }>(
            sql`SELECT c.name as category, cg.name as group_name, SUM(t.amount) as total, COUNT(*) as count
             FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
             LEFT JOIN category_groups cg ON c.group_id = cg.id LEFT JOIN accounts a ON t.account_id = a.id
             WHERE 1=1${whereExtra} AND t.is_child = 0 GROUP BY t.category_id ORDER BY total`,
          );
          return validatedJson(CustomReportResultSchema, {
            rows: rows.map((r) => ({ category: r.category ?? "Uncategorized", groupName: r.group_name ?? null, total: Number(r.total), count: Number(r.count) })),
            groupBy: "category",
          });
        }

        const rows = await db.all<{
          id: string; date: string; amount: number; payee: string | null;
          notes: string | null; cleared: number; reconciled: number;
          category_name: string | null; account_name: string | null;
        }>(
          sql`SELECT t.id, t.date, t.amount, t.payee, t.notes, t.cleared, t.reconciled,
                  c.name as category_name, a.name as account_name
           FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
           LEFT JOIN accounts a ON t.account_id = a.id
           WHERE 1=1${whereExtra} AND t.is_child = 0 ORDER BY t.date DESC LIMIT 500`,
        );
        return validatedJson(CustomReportResultSchema, {
          rows: rows.map((r) => ({
            id: String(r.id), date: r.date, amount: Number(r.amount ?? 0), payee: r.payee ?? null,
            notes: r.notes ?? null, cleared: Number(r.cleared ?? 0) === 1,
            reconciled: Number(r.reconciled ?? 0) === 1, category: r.category_name ?? null,
            account: r.account_name ?? null,
          })),
          groupBy: null,
        });
      }),
      isRaw: true,
      uninterruptible: false,
    });

    return handlers;
  });
}
