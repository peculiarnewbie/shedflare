/**
 * REST API handlers — typed read endpoints using Drizzle query builder.
 * All responses are validated against Effect schemas from domain/schemas.ts.
 */
import { eq, sql, and, inArray, type SQL } from "drizzle-orm";
import * as S from "effect/Schema";
import * as s from "../db/schema";
import type { Db } from "./d1-access";
import type { FilterCondition } from "./conditions-to-sql";
import { buildFilterSql, buildFilterWhereSql } from "./conditions-to-sql";
import {
  computeMonthBudget,
  computeNetWorthHistory,
  computeCashFlow,
  computeSpendingByCategory,
  computeDailyHeatmap,
  computeAgeOfMoney,
  computeCrossoverProjection,
} from "./budget-engine";
import { discoverSchedules } from "./discover-schedules";
import { monthBoundaries } from "../domain/types";
import {
  AccountsResponseSchema,
  AccountApiSchema,
  AccountTransactionsResponseSchema,
  AccountTagsResponseSchema,
  TransactionsResponseSchema,
  CategoriesResponseSchema,
  CategoryGroupsResponseSchema,
  GoalProgressResponseSchema,
  BudgetOverviewResponseSchema,
  MonthBudgetResponseSchema,
  PayeesResponseSchema,
  PayeeSuggestionsResponseSchema,
  SchedulesResponseSchema,
  ScheduleResponseSchema,
  SchedulesDiscoverResponseSchema,
  RulesResponseSchema,
  TagsResponseSchema,
  FiltersResponseSchema,
  ReportsNetWorthResponseSchema,
  ReportsCashFlowResponseSchema,
  ReportsSpendingResponseSchema,
  ReportsBudgetAnalysisResponseSchema,
  ReportsAgeOfMoneyResponseSchema,
  ReportsCrossoverResponseSchema,
  ReportsHeatmapResponseSchema,
  CustomReportsResponseSchema,
  CustomReportResultSchema,
  DashboardWidgetsResponseSchema,
  DashboardExportSchema,
  RatesResponseSchema,
} from "../domain/schemas";

function validatedJson(
  schema: Parameters<typeof S.encodeSync>[0],
  data: unknown,
  status = 200,
): Response {
  const encoded = (
    S.encodeSync as (s: Parameters<typeof S.encodeSync>[0]) => (u: unknown) => unknown
  )(schema)(data);
  return new Response(JSON.stringify(encoded), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export async function handleApiRequest(url: URL, method: string, db: Db): Promise<Response | null> {
  const pathname = url.pathname;

  // ── Accounts list ────────────────────────────────────────────────────
  if (pathname === "/api/accounts" && method === "GET") {
    const rows = await db.all<{
      id: string;
      name: string;
      offbudget: number;
      closed: number;
      sort_order: number;
      balance_current: number;
      last_reconciled: string | null;
    }>(
      sql`SELECT a.id, a.name, a.offbudget, a.closed, a.sort_order,
              COALESCE(a.balance_current, 0) + COALESCE(SUM(CASE WHEN t.is_child = 0 THEN t.amount ELSE 0 END), 0) AS balance_current,
              a.last_reconciled
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       GROUP BY a.id
       ORDER BY a.sort_order, a.name`,
    );
    return validatedJson(AccountsResponseSchema, {
      accounts: rows.map((r) => ({
        id: r.id,
        name: r.name,
        offbudget: r.offbudget === 1,
        closed: r.closed === 1,
        sortOrder: r.sort_order,
        balanceCurrent: Number(r.balance_current),
        lastReconciled: r.last_reconciled,
      })),
    });
  }

  // ── Single account ───────────────────────────────────────────────────
  const accountMatch = pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (accountMatch && method === "GET") {
    const rows = await db
      .select({
        id: s.accounts.id,
        name: s.accounts.name,
        offbudget: s.accounts.offbudget,
        closed: s.accounts.closed,
        sortOrder: s.accounts.sortOrder,
        balanceCurrent:
          sql<number>`COALESCE(${s.accounts.balanceCurrent}, 0) + COALESCE(SUM(CASE WHEN ${s.transactions.isChild} = 0 THEN ${s.transactions.amount} ELSE 0 END), 0)`.mapWith(
            Number,
          ),
        lastReconciled: s.accounts.lastReconciled,
      })
      .from(s.accounts)
      .leftJoin(s.transactions, eq(s.transactions.accountId, s.accounts.id))
      .where(eq(s.accounts.id, accountMatch[1]))
      .groupBy(s.accounts.id)
      .all();
    const row = rows[0];
    if (!row)
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    return validatedJson(AccountApiSchema, {
      id: row.id,
      name: row.name,
      offbudget: row.offbudget,
      closed: row.closed,
      sortOrder: row.sortOrder,
      balanceCurrent: row.balanceCurrent,
      lastReconciled: row.lastReconciled,
    });
  }

  // ── Account transactions ─────────────────────────────────────────────
  const accountTxMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/transactions$/);
  if (accountTxMatch && method === "GET") {
    const filterId = url.searchParams.get("filter");
    const accountId = accountTxMatch[1];

    let whereClause = eq(s.transactions.accountId, accountId);

    if (filterId) {
      const [filterRow] = await db
        .select()
        .from(s.transactionFilters)
        .where(eq(s.transactionFilters.id, filterId))
        .all();
      if (filterRow) {
        const conditions = JSON.parse(
          (filterRow.conditions as string) ?? "[]",
        ) as FilterCondition[];
        const conditionsOp = (filterRow.conditionsOp as string) ?? "and";
        const filterSql = buildFilterSql(conditions, conditionsOp as "and" | "or");
        if (filterSql) {
          whereClause = and(whereClause, filterSql) as SQL<unknown>;
        }
      }
    }

    const rows = await db
      .select({
        id: s.transactions.id,
        accountId: s.transactions.accountId,
        categoryId: s.transactions.categoryId,
        amount: s.transactions.amount,
        payee: s.transactions.payee,
        notes: s.transactions.notes,
        date: s.transactions.date,
        cleared: s.transactions.cleared,
        reconciled: s.transactions.reconciled,
        importedDescription: s.transactions.importedDescription,
        startingBalanceFlag: s.transactions.startingBalanceFlag,
        sortOrder: s.transactions.sortOrder,
        isParent: s.transactions.isParent,
        isChild: s.transactions.isChild,
        parentId: s.transactions.parentId,
        transferId: s.transactions.transferId,
        scheduleId: s.transactions.scheduleId,
        createdAt: s.transactions.createdAt,
        updatedAt: s.transactions.updatedAt,
        categoryName: s.categories.name,
        scheduleName: s.schedules.name,
      })
      .from(s.transactions)
      .leftJoin(s.categories, eq(s.transactions.categoryId, s.categories.id))
      .leftJoin(s.schedules, eq(s.transactions.scheduleId, s.schedules.id))
      .where(whereClause)
      .orderBy(sql`${s.transactions.date} DESC, ${s.transactions.createdAt} DESC`)
      .all();
    return validatedJson(AccountTransactionsResponseSchema, { transactions: rows });
  }

  // ── All transactions ─────────────────────────────────────────────────
  if (pathname === "/api/transactions" && method === "GET") {
    const filterId = url.searchParams.get("filter");
    let whereClause: SQL<unknown> | undefined;

    if (filterId) {
      const [filterRow] = await db
        .select()
        .from(s.transactionFilters)
        .where(eq(s.transactionFilters.id, filterId))
        .all();
      if (filterRow) {
        const conditions = JSON.parse(
          (filterRow.conditions as string) ?? "[]",
        ) as FilterCondition[];
        const conditionsOp = (filterRow.conditionsOp as string) ?? "and";
        whereClause = buildFilterSql(conditions, conditionsOp as "and" | "or") ?? undefined;
      }
    }

    const query = db
      .select({
        id: s.transactions.id,
        accountId: s.transactions.accountId,
        categoryId: s.transactions.categoryId,
        amount: s.transactions.amount,
        payee: s.transactions.payee,
        notes: s.transactions.notes,
        date: s.transactions.date,
        cleared: s.transactions.cleared,
        reconciled: s.transactions.reconciled,
        importedDescription: s.transactions.importedDescription,
        startingBalanceFlag: s.transactions.startingBalanceFlag,
        sortOrder: s.transactions.sortOrder,
        isParent: s.transactions.isParent,
        isChild: s.transactions.isChild,
        parentId: s.transactions.parentId,
        transferId: s.transactions.transferId,
        scheduleId: s.transactions.scheduleId,
        createdAt: s.transactions.createdAt,
        updatedAt: s.transactions.updatedAt,
        categoryName: s.categories.name,
        accountName: s.accounts.name,
        scheduleName: s.schedules.name,
      })
      .from(s.transactions)
      .leftJoin(s.categories, eq(s.transactions.categoryId, s.categories.id))
      .leftJoin(s.accounts, eq(s.transactions.accountId, s.accounts.id))
      .leftJoin(s.schedules, eq(s.transactions.scheduleId, s.schedules.id))
      .orderBy(sql`${s.transactions.date} DESC, ${s.transactions.createdAt} DESC`);

    if (whereClause) {
      query.where(whereClause);
    }

    const rows = await query.all();
    const missingCategoryIds = [
      ...new Set(
        rows
          .filter((r) => r.categoryId && !r.categoryName)
          .map((r) => r.categoryId)
          .filter(isString),
      ),
    ];
    const missingAccountIds = [
      ...new Set(rows.filter((r) => r.accountId && !r.accountName).map((r) => r.accountId)),
    ];
    const categoryNames = new Map<string, string>();
    if (missingCategoryIds.length > 0) {
      const cats = await db
        .select({ id: s.categories.id, name: s.categories.name })
        .from(s.categories)
        .where(inArray(s.categories.id, missingCategoryIds))
        .all();
      for (const cat of cats) categoryNames.set(cat.id, cat.name);
    }
    const accountNames = new Map<string, string>();
    if (missingAccountIds.length > 0) {
      const accounts = await db
        .select({ id: s.accounts.id, name: s.accounts.name })
        .from(s.accounts)
        .where(inArray(s.accounts.id, missingAccountIds))
        .all();
      for (const account of accounts) accountNames.set(account.id, account.name);
    }
    return validatedJson(TransactionsResponseSchema, {
      transactions: rows.map((r) => ({
        id: r.id,
        accountId: r.accountId,
        categoryId: r.categoryId,
        amount: r.amount,
        payee: r.payee,
        notes: r.notes,
        date: r.date,
        cleared: r.cleared,
        reconciled: r.reconciled,
        importedDescription: r.importedDescription,
        startingBalanceFlag: r.startingBalanceFlag,
        sortOrder: r.sortOrder,
        isParent: r.isParent,
        isChild: r.isChild,
        parentId: r.parentId,
        transferId: r.transferId,
        scheduleId: r.scheduleId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        categoryName:
          r.categoryName ?? (r.categoryId ? (categoryNames.get(r.categoryId) ?? null) : null),
        accountName: r.accountName ?? accountNames.get(r.accountId) ?? null,
        scheduleName: r.scheduleName,
      })),
    });
  }

  // ── Budget overview ──────────────────────────────────────────────────
  if (pathname === "/api/budget/overview" && method === "GET") {
    const netWorthRow = await db.get<{ total: number }>(
      sql`SELECT COALESCE(SUM(balance), 0) AS total
       FROM (
         SELECT COALESCE(a.balance_current, 0) + COALESCE(SUM(CASE WHEN t.is_child = 0 THEN t.amount ELSE 0 END), 0) AS balance
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
         WHERE a.closed = 0
         GROUP BY a.id
       )`,
    );
    const onBudgetRow = await db.get<{ total: number }>(
      sql`SELECT COALESCE(SUM(balance), 0) AS total
       FROM (
         SELECT COALESCE(a.balance_current, 0) + COALESCE(SUM(CASE WHEN t.is_child = 0 THEN t.amount ELSE 0 END), 0) AS balance
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
         WHERE a.offbudget = 0 AND a.closed = 0
         GROUP BY a.id
       )`,
    );
    const accountCount = await db.$count(s.accounts, eq(s.accounts.closed, false));

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { start: startDate, end: endDate } = monthBoundaries(monthKey);

    const incomeRow = await db.get<{ total: number }>(
      sql`SELECT COALESCE(SUM(t.amount), 0) as total
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ${startDate} AND t.date <= ${endDate} AND c.is_income = 1 AND t.is_child = 0`,
    );

    const expenseRow = await db.get<{ total: number }>(
      sql`SELECT COALESCE(SUM(t.amount), 0) as total
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ${startDate} AND t.date <= ${endDate} AND c.is_income = 0 AND t.is_child = 0`,
    );

    return validatedJson(BudgetOverviewResponseSchema, {
      netWorth: netWorthRow?.total ?? 0,
      onBudget: onBudgetRow?.total ?? 0,
      accountCount: accountCount ?? 0,
      income: incomeRow?.total ?? 0,
      expense: expenseRow?.total ?? 0,
    });
  }

  // ── Budget for a specific month ─────────────────────────────────────
  const budgetMatch = pathname.match(/^\/api\/budget\/(\d{6})$/);
  if (budgetMatch && method === "GET") {
    const month = parseInt(budgetMatch[1]);
    const result = await computeMonthBudget(db, month);
    return validatedJson(
      MonthBudgetResponseSchema,
      result ?? { categories: [], toBudget: 0, buffered: 0, month },
    );
  }

  // ── Categories ──────────────────────────────────────────────────────
  if (pathname === "/api/categories" && method === "GET") {
    const rows = await db.all<{
      id: string;
      name: string;
      is_income: number;
      group_id: string | null;
      sort_order: number;
      hidden: number;
      goal_def: string | null;
      created_at: string;
      updated_at: string;
      group_name: string | null;
    }>(
      sql`SELECT c.id, c.name, c.is_income, c.group_id, c.sort_order, c.hidden, c.goal_def,
              c.created_at, c.updated_at, cg.name AS group_name
       FROM categories c
       LEFT JOIN category_groups cg ON c.group_id = cg.id
       ORDER BY cg.sort_order, c.sort_order`,
    );
    return validatedJson(CategoriesResponseSchema, {
      categories: rows.map((r) => ({
        id: r.id,
        name: r.name,
        isIncome: r.is_income === 1,
        groupId: r.group_id,
        sortOrder: r.sort_order,
        hidden: r.hidden === 1,
        goalDef: r.goal_def,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        group_name: r.group_name,
      })),
    });
  }

  if (pathname === "/api/category-groups" && method === "GET") {
    const rows = await db
      .select()
      .from(s.categoryGroups)
      .orderBy(s.categoryGroups.sortOrder, s.categoryGroups.name)
      .all();
    return validatedJson(CategoryGroupsResponseSchema, { groups: rows });
  }

  // ── Goal progress ──────────────────────────────────────────────────
  if (pathname === "/api/categories/goal-progress" && method === "GET") {
    return validatedJson(GoalProgressResponseSchema, { progress: [] });
  }

  // ── Payees ──────────────────────────────────────────────────────────
  if (pathname === "/api/payees" && method === "GET") {
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
    return validatedJson(PayeesResponseSchema, { payees: rows.map(mapPayeeRow) });
  }

  // ── Payee category suggestions ─────────────────────────────────────
  const payeeCatMatch = pathname.match(/^\/api\/payees\/category-suggestions$/);
  if (payeeCatMatch && method === "GET") {
    const payeeName = url.searchParams.get("payee");
    if (!payeeName) return validatedJson(PayeeSuggestionsResponseSchema, { suggestions: [] });
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
       GROUP BY t.category_id
       ORDER BY count DESC
       LIMIT 5`,
    );
    return validatedJson(PayeeSuggestionsResponseSchema, { suggestions: rows });
  }

  // ── Schedules ───────────────────────────────────────────────────────
  if (pathname === "/api/schedules" && method === "GET") {
    const rows = await db.select().from(s.schedules).orderBy(s.schedules.name).all();
    return validatedJson(SchedulesResponseSchema, { schedules: rows });
  }

  if (pathname === "/api/schedules/discover" && method === "GET") {
    const discovered = await discoverSchedules(db);
    return validatedJson(SchedulesDiscoverResponseSchema, { discovered });
  }

  const scheduleMatch = pathname.match(/^\/api\/schedules\/([^/]+)$/);
  if (scheduleMatch && method === "GET") {
    const rows = await db
      .select({
        id: s.schedules.id,
        name: s.schedules.name,
        accountId: s.schedules.accountId,
        payeeId: s.schedules.payeeId,
        categoryId: s.schedules.categoryId,
        amount: s.schedules.amount,
        startDate: s.schedules.startDate,
        recurrenceRules: s.schedules.recurrenceRules,
        active: s.schedules.active,
        completed: s.schedules.completed,
        postsTransaction: s.schedules.postsTransaction,
        customUpcomingLength: s.schedules.customUpcomingLength,
        nextDate: s.schedules.nextDate,
        createdAt: s.schedules.createdAt,
        updatedAt: s.schedules.updatedAt,
        account_name: s.accounts.name,
        payee_name: s.payees.name,
        category_name: s.categories.name,
        group_name: s.categoryGroups.name,
      })
      .from(s.schedules)
      .leftJoin(s.accounts, eq(s.schedules.accountId, s.accounts.id))
      .leftJoin(s.payees, eq(s.schedules.payeeId, s.payees.id))
      .leftJoin(s.categories, eq(s.schedules.categoryId, s.categories.id))
      .leftJoin(s.categoryGroups, eq(s.categories.groupId, s.categoryGroups.id))
      .where(eq(s.schedules.id, scheduleMatch[1]))
      .all();
    const row = rows[0];
    if (!row)
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    return validatedJson(ScheduleResponseSchema, { schedule: row });
  }

  // ── Filters ─────────────────────────────────────────────────────────
  if (pathname === "/api/filters" && method === "GET") {
    const rows = await db
      .select()
      .from(s.transactionFilters)
      .orderBy(s.transactionFilters.name)
      .all();
    return validatedJson(FiltersResponseSchema, { filters: rows });
  }

  // ── Rules ───────────────────────────────────────────────────────────
  if (pathname === "/api/rules" && method === "GET") {
    const rows = await db
      .select()
      .from(s.rules)
      .where(eq(s.rules.deleted, false))
      .orderBy(s.rules.createdAt)
      .all();
    return validatedJson(RulesResponseSchema, { rules: rows });
  }

  // ── Tags for account ────────────────────────────────────────────────
  const txTagsMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/tags$/);
  if (txTagsMatch && method === "GET") {
    const rows = await db
      .select({
        transactionId: s.transactionTags.transactionId,
        tagId: s.transactionTags.tagId,
        tagName: s.tags.name,
        tagColor: s.tags.color,
      })
      .from(s.transactionTags)
      .innerJoin(s.tags, eq(s.transactionTags.tagId, s.tags.id))
      .innerJoin(s.transactions, eq(s.transactionTags.transactionId, s.transactions.id))
      .where(eq(s.transactions.accountId, txTagsMatch[1]))
      .orderBy(s.tags.name)
      .all();
    return validatedJson(AccountTagsResponseSchema, { transactionTags: rows });
  }

  // ── Tags ────────────────────────────────────────────────────────────
  if (pathname === "/api/tags" && method === "GET") {
    const rows = await db.select().from(s.tags).orderBy(s.tags.name).all();
    return validatedJson(TagsResponseSchema, { tags: rows });
  }

  // ── Exchange rates ──────────────────────────────────────────────────
  if (pathname === "/api/rates" && method === "GET") {
    const [row] = await db
      .select()
      .from(s.exchangeRates)
      .where(eq(s.exchangeRates.id, "latest"))
      .all();
    return validatedJson(
      RatesResponseSchema,
      row
        ? { id: row.id, usdToIdr: row.usdToIdr, updatedAt: row.updatedAt }
        : { id: "latest", usdToIdr: 16000, updatedAt: new Date().toISOString() },
    );
  }

  // ── Report: net worth over time ─────────────────────────────────────
  if (pathname === "/api/reports/net-worth" && method === "GET") {
    const history = await computeNetWorthHistory(db, 12);
    const points = history.map((h) => ({ date: h.month, value: h.netWorth }));
    return validatedJson(ReportsNetWorthResponseSchema, { points });
  }

  // ── Report: cash flow ───────────────────────────────────────────────
  if (pathname === "/api/reports/cash-flow" && method === "GET") {
    const months = await computeCashFlow(db, 12);
    return validatedJson(ReportsCashFlowResponseSchema, { months });
  }

  // ── Report: spending by category ────────────────────────────────────
  if (pathname === "/api/reports/spending" && method === "GET") {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { start: startDate, end: endDate } = monthBoundaries(monthKey);
    const cats = await computeSpendingByCategory(db, startDate, endDate);
    const categories = cats.map((c) => ({
      label: c.categoryName,
      value: Math.abs(c.amount),
      groupName: c.groupName,
    }));
    return validatedJson(ReportsSpendingResponseSchema, { categories });
  }

  // ── Report: budget vs actuals ───────────────────────────────────────
  if (pathname === "/api/reports/budget-analysis" && method === "GET") {
    const now = new Date();
    const monthInt = now.getFullYear() * 100 + (now.getMonth() + 1);
    const result = await computeMonthBudget(db, monthInt);
    const categories = (result?.categories ?? []).map((c) => ({
      category: c.categoryName,
      budgeted: c.budgeted,
      actual: c.spent,
    }));
    return validatedJson(ReportsBudgetAnalysisResponseSchema, { categories });
  }

  // ── Report: age of money ────────────────────────────────────────────
  if (pathname === "/api/reports/age-of-money" && method === "GET") {
    const days = await computeAgeOfMoney(db);
    return validatedJson(ReportsAgeOfMoneyResponseSchema, { days });
  }

  // ── Report: crossover projection ────────────────────────────────────
  if (pathname === "/api/reports/crossover" && method === "GET") {
    const result = await computeCrossoverProjection(db);
    if (!result)
      return new Response(JSON.stringify({ error: "Not enough data" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    return validatedJson(ReportsCrossoverResponseSchema, result);
  }

  // ── Report: calendar heatmap ────────────────────────────────────────
  if (pathname === "/api/reports/calendar-heatmap" && method === "GET") {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { income, expense } = await computeDailyHeatmap(db, monthKey);
    return validatedJson(ReportsHeatmapResponseSchema, { monthKey, income, expense });
  }

  // ── Custom reports list ─────────────────────────────────────────────
  if (pathname === "/api/reports/custom" && method === "GET") {
    const rows = await db
      .select()
      .from(s.customReports)
      .orderBy(sql`${s.customReports.createdAt} DESC`)
      .all();
    return validatedJson(CustomReportsResponseSchema, { reports: rows });
  }

  // ── Execute a custom report ─────────────────────────────────────────
  const customReportMatch = pathname.match(/^\/api\/reports\/custom\/([^/]+)\/execute$/);
  if (customReportMatch && method === "GET") {
    const [reportRow] = await db
      .select()
      .from(s.customReports)
      .where(eq(s.customReports.id, customReportMatch[1]))
      .all();
    if (!reportRow)
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });

    const conditions = JSON.parse((reportRow.conditions as string) ?? "[]") as FilterCondition[];
    const conditionsOp = ((reportRow.conditionsOp as string) ?? "and") as "and" | "or";
    const groupBy = (reportRow.groupBy as string) ?? null;
    const startDate = (reportRow.startDate as string) ?? null;
    const endDate = (reportRow.endDate as string) ?? null;

    let whereExtra = sql``;
    const allParams: unknown[] = [];

    if (startDate) {
      whereExtra = sql`${whereExtra} AND t.date >= ${startDate}`;
    }
    if (endDate) {
      whereExtra = sql`${whereExtra} AND t.date <= ${endDate}`;
    }

    if (conditions.length > 0) {
      const { whereClause, params } = buildFilterWhereSql(conditions, conditionsOp);
      if (whereClause) {
        whereExtra = sql`${whereExtra} AND (${sql.raw(whereClause)})`;
        allParams.push(...params);
      }
    }

    if (groupBy === "month") {
      const rows = await db.all<{ month: string; total: number; count: number }>(
        sql`SELECT strftime('%Y-%m', t.date) as month,
                SUM(t.amount) as total,
                COUNT(*) as count
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE 1=1${whereExtra} AND t.is_child = 0
         GROUP BY strftime('%Y-%m', t.date)
         ORDER BY month`,
      );
      return validatedJson(CustomReportResultSchema, {
        rows: rows.map((r) => ({ month: r.month, total: Number(r.total), count: Number(r.count) })),
        groupBy: "month",
      });
    }

    if (groupBy === "category") {
      const rows = await db.all<{
        category: string | null;
        group_name: string | null;
        total: number;
        count: number;
      }>(
        sql`SELECT c.name as category, cg.name as group_name,
                SUM(t.amount) as total, COUNT(*) as count
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         LEFT JOIN category_groups cg ON c.group_id = cg.id
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE 1=1${whereExtra} AND t.is_child = 0
         GROUP BY t.category_id
         ORDER BY total`,
      );
      return validatedJson(CustomReportResultSchema, {
        rows: rows.map((r) => ({
          category: r.category ?? "Uncategorized",
          groupName: r.group_name ?? null,
          total: Number(r.total),
          count: Number(r.count),
        })),
        groupBy: "category",
      });
    }

    // Default: individual transactions
    const rows = await db.all<{
      id: string;
      date: string;
      amount: number;
      payee: string | null;
      notes: string | null;
      cleared: number;
      reconciled: number;
      category_name: string | null;
      account_name: string | null;
    }>(
      sql`SELECT t.id, t.date, t.amount, t.payee, t.notes, t.cleared, t.reconciled,
              c.name as category_name, a.name as account_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN accounts a ON t.account_id = a.id
       WHERE 1=1${whereExtra} AND t.is_child = 0
       ORDER BY t.date DESC
       LIMIT 500`,
    );
    return validatedJson(CustomReportResultSchema, {
      rows: rows.map((r) => ({
        id: String(r.id),
        date: r.date,
        amount: Number(r.amount ?? 0),
        payee: r.payee ?? null,
        notes: r.notes ?? null,
        cleared: Number(r.cleared ?? 0) === 1,
        reconciled: Number(r.reconciled ?? 0) === 1,
        category: r.category_name ?? null,
        account: r.account_name ?? null,
      })),
      groupBy: null,
    });
  }

  // ── Dashboard widgets ───────────────────────────────────────────────
  if (pathname === "/api/dashboard/widgets" && method === "GET") {
    const rows = await db
      .select()
      .from(s.dashboardWidgets)
      .orderBy(s.dashboardWidgets.y, s.dashboardWidgets.x)
      .all();
    return validatedJson(DashboardWidgetsResponseSchema, { widgets: rows });
  }

  // ── Dashboard export ────────────────────────────────────────────────
  if (pathname === "/api/dashboard/export" && method === "GET") {
    const rows = await db
      .select()
      .from(s.dashboardWidgets)
      .orderBy(s.dashboardWidgets.y, s.dashboardWidgets.x)
      .all();
    return validatedJson(DashboardExportSchema, {
      version: 1,
      exportedAt: new Date().toISOString(),
      widgets: rows,
    });
  }

  // ── CSV export ──────────────────────────────────────────────────────
  if (pathname === "/api/export/csv" && method === "GET") {
    const rows = await db.all<{
      date: string;
      amount: number;
      payee: string | null;
      category: string | null;
      notes: string | null;
      account: string;
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
      [
        r.date,
        Number(r.amount ?? 0) / 100,
        `"${r.payee ?? ""}"`,
        `"${r.category ?? ""}"`,
        `"${r.notes ?? ""}"`,
        `"${r.account ?? ""}"`,
      ].join(","),
    );
    return new Response(header + csvLines.join("\n"), {
      headers: {
        "content-type": "text/csv",
        "content-disposition": 'attachment; filename="shedflare-export.csv"',
      },
    });
  }

  return null;
}

// -- Row mappers (only needed for raw SQL aggregate queries) ---------------
function mapPayeeRow(row: {
  id: string;
  name: string;
  transfer_account_id: string | null;
  favorite: number;
  created_at: string;
  updated_at: string;
  transaction_count: number;
}) {
  return {
    id: row.id,
    name: row.name,
    transferAccountId: row.transfer_account_id,
    favorite: row.favorite === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    transaction_count: Number(row.transaction_count),
  };
}
