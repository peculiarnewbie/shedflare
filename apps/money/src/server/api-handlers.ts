/**
 * REST API handlers for the DO — provides read endpoints for initial data loading.
 * These are convenience endpoints; the real-time data path is through WebSocket sync.
 */
import type { DataAccess } from "./data-access";
import {
  computeMonthBudget,
  computeNetWorthHistory,
  computeCashFlow,
  computeSpendingByCategory,
  computeDailySpending,
  computeAgeOfMoney,
  computeCrossoverProjection,
} from "./budget-engine";
import { buildFilterWhereSql, type FilterCondition } from "./conditions-to-sql";
import { discoverSchedules } from "./discover-schedules";

export function handleApiRequest(url: URL, method: string, access: DataAccess): Response | null {
  const pathname = url.pathname;
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });

  // Accounts list
  if (pathname === "/api/accounts" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      `SELECT a.id, a.name, a.offbudget, a.closed, a.sort_order,
              COALESCE(a.balance_current, 0) + COALESCE(SUM(t.amount), 0) AS balance_current
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       GROUP BY a.id
       ORDER BY a.sort_order, a.name`,
    );
    return json({ accounts: rows.map(mapAccountRow) });
  }

  // Single account
  const accountMatch = pathname.match(/^\/api\/accounts\/([^/]+)$/);
  if (accountMatch && method === "GET") {
    const row = access.queryOne<Record<string, unknown>>(
      `SELECT a.*, COALESCE(a.balance_current, 0) + COALESCE(SUM(t.amount), 0) AS computed_balance
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       WHERE a.id = ?
       GROUP BY a.id`,
      accountMatch[1],
    );
    if (!row) return json({ error: "Not found" }, 404);
    return json(mapAccountRow({ ...row, balance_current: row.computed_balance }));
  }

  // Account transactions
  const accountTxMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/transactions$/);
  if (accountTxMatch && method === "GET") {
    const filterId = url.searchParams.get("filter");
    let whereExtra = "";
    let params: unknown[] = [accountTxMatch[1]];

    if (filterId) {
      const filterRow = access.queryOne<Record<string, unknown>>(
        `SELECT * FROM transaction_filters WHERE id = ?`,
        filterId,
      );
      if (filterRow) {
        const conditions = JSON.parse(
          (filterRow.conditions as string) ?? "[]",
        ) as FilterCondition[];
        const conditionsOp = (filterRow.conditions_op as string) ?? "and";
        const { whereClause, params: filterParams } = buildFilterWhereSql(
          conditions,
          conditionsOp as "and" | "or",
        );
        if (whereClause) {
          whereExtra = ` AND (${whereClause})`;
          params = [...params, ...filterParams];
        }
      }
    }

    const rows = access.queryAll<Record<string, unknown>>(
      `SELECT t.*, c.name as category_name, s.name as schedule_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN schedules s ON t.schedule_id = s.id
       WHERE t.account_id = ?${whereExtra}
       ORDER BY t.date DESC, t.created_at DESC`,
      ...params,
    );
    return json({ transactions: rows });
  }

  // Budget overview
  if (pathname === "/api/budget/overview" && method === "GET") {
    const netWorth = access.queryOne<{ total: number | null }>(
      `SELECT COALESCE(SUM(balance), 0) AS total
       FROM (
         SELECT COALESCE(a.balance_current, 0) + COALESCE(SUM(t.amount), 0) AS balance
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
         WHERE a.closed = 0
         GROUP BY a.id
       )`,
    );
    const onBudget = access.queryOne<{ total: number | null }>(
      `SELECT COALESCE(SUM(balance), 0) AS total
       FROM (
         SELECT COALESCE(a.balance_current, 0) + COALESCE(SUM(t.amount), 0) AS balance
         FROM accounts a
         LEFT JOIN transactions t ON t.account_id = a.id
         WHERE a.offbudget = 0 AND a.closed = 0
         GROUP BY a.id
       )`,
    );
    const accountCount = access.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM accounts WHERE closed = 0",
    );

    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const income = access.queryOne<{ total: number | null }>(
      `SELECT COALESCE(SUM(t.amount), 0) as total
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ? AND c.is_income = 1 AND t.is_child = 0`,
      startDate,
      endDate,
    );

    const expense = access.queryOne<{ total: number | null }>(
      `SELECT COALESCE(SUM(t.amount), 0) as total
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ? AND c.is_income = 0 AND t.is_child = 0`,
      startDate,
      endDate,
    );

    return json({
      netWorth: netWorth?.total ?? 0,
      onBudget: onBudget?.total ?? 0,
      accountCount: accountCount?.count ?? 0,
      income: income?.total ?? 0,
      expense: expense?.total ?? 0,
    });
  }

  // Budget for a specific month
  const budgetMatch = pathname.match(/^\/api\/budget\/(\d{6})$/);
  if (budgetMatch && method === "GET") {
    const month = parseInt(budgetMatch[1]);
    const result = computeMonthBudget(access, month);
    return json(result ?? { categories: [], toBudget: 0, buffered: 0, month });
  }

  // Categories
  if (pathname === "/api/categories" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      `SELECT c.*, cg.name as group_name
       FROM categories c
       LEFT JOIN category_groups cg ON c.group_id = cg.id
       ORDER BY cg.sort_order, c.sort_order`,
    );
    return json({ categories: rows });
  }

  if (pathname === "/api/category-groups" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      "SELECT * FROM category_groups ORDER BY sort_order, name",
    );
    return json({ groups: rows.map(mapCategoryGroupRow) });
  }

  // Goal progress
  if (pathname === "/api/categories/goal-progress" && method === "GET") {
    const now = new Date();
    const month = now.getFullYear() * 100 + (now.getMonth() + 1);
    const progress = access.getCategoryGoalProgress(month);
    return json({ progress });
  }

  // Payees
  if (pathname === "/api/payees" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      `SELECT p.*, (SELECT COUNT(*) FROM transactions WHERE payee = p.name) as transaction_count
       FROM payees p ORDER BY p.name`,
    );
    return json({ payees: rows });
  }

  // Schedules
  if (pathname === "/api/schedules" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>("SELECT * FROM schedules ORDER BY name");
    return json({ schedules: rows });
  }

  // Schedule discovery
  if (pathname === "/api/schedules/discover" && method === "GET") {
    const discovered = discoverSchedules(access);
    return json({ discovered });
  }

  // Single schedule by ID
  const scheduleMatch = pathname.match(/^\/api\/schedules\/([^/]+)$/);
  if (scheduleMatch && method === "GET") {
    const row = access.queryOne<Record<string, unknown>>(
      `SELECT s.*, a.name as account_name, p.name as payee_name,
              c.name as category_name, cg.name as group_name
       FROM schedules s
       LEFT JOIN accounts a ON s.account_id = a.id
       LEFT JOIN payees p ON s.payee_id = p.id
       LEFT JOIN categories c ON s.category_id = c.id
       LEFT JOIN category_groups cg ON c.group_id = cg.id
       WHERE s.id = ?`,
      scheduleMatch[1],
    );
    if (!row) return json({ error: "Not found" }, 404);
    return json({ schedule: row });
  }

  // All transactions (across all accounts, for rule testing and general use)
  if (pathname === "/api/transactions" && method === "GET") {
    const filterId = url.searchParams.get("filter");
    let whereExtra = "";
    let params: unknown[] = [];

    if (filterId) {
      const filterRow = access.queryOne<Record<string, unknown>>(
        `SELECT * FROM transaction_filters WHERE id = ?`,
        filterId,
      );
      if (filterRow) {
        const conditions = JSON.parse(
          (filterRow.conditions as string) ?? "[]",
        ) as FilterCondition[];
        const conditionsOp = (filterRow.conditions_op as string) ?? "and";
        const { whereClause, params: filterParams } = buildFilterWhereSql(
          conditions,
          conditionsOp as "and" | "or",
        );
        if (whereClause) {
          whereExtra = ` WHERE ${whereClause}`;
          params = [...params, ...filterParams];
        }
      }
    }

    const rows = access.queryAll<Record<string, unknown>>(
      `SELECT t.*, c.name as category_name, a.name as account_name, s.name as schedule_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       LEFT JOIN accounts a ON t.account_id = a.id
       LEFT JOIN schedules s ON t.schedule_id = s.id${whereExtra}
       ORDER BY t.date DESC, t.created_at DESC`,
      ...params,
    );
    return json({ transactions: rows });
  }

  // Transaction filters
  if (pathname === "/api/filters" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      "SELECT * FROM transaction_filters ORDER BY name",
    );
    return json({ filters: rows });
  }

  // Rules
  if (pathname === "/api/rules" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      "SELECT * FROM rules ORDER BY created_at",
    );
    return json({ rules: rows });
  }

  // Tags for a specific transaction
  const txTagsMatch = pathname.match(/^\/api\/accounts\/([^/]+)\/tags$/);
  if (txTagsMatch && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      `SELECT tt.transaction_id, tt.tag_id, t.name as tag_name, t.color as tag_color
       FROM transaction_tags tt
       JOIN tags t ON t.id = tt.tag_id
       JOIN transactions tx ON tx.id = tt.transaction_id
       WHERE tx.account_id = ?
       ORDER BY t.name`,
      txTagsMatch[1],
    );
    return json({ transactionTags: rows });
  }

  // Tags
  if (pathname === "/api/tags" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>("SELECT * FROM tags ORDER BY name");
    return json({ tags: rows });
  }

  // Exchange rates
  if (pathname === "/api/rates" && method === "GET") {
    const row = access.queryOne<Record<string, unknown>>(
      "SELECT * FROM exchange_rates WHERE id = 'latest'",
    );
    return json(
      row
        ? { id: row.id, usdToIdr: row.usd_to_idr, updatedAt: row.updated_at }
        : { id: "latest", usdToIdr: 16000 },
    );
  }

  // Report: net worth over time
  if (pathname === "/api/reports/net-worth" && method === "GET") {
    const history = computeNetWorthHistory(access, 12);
    const points = history.map((h) => ({
      date: h.month,
      value: h.netWorth,
    }));
    return json({ points });
  }

  // Report: cash flow
  if (pathname === "/api/reports/cash-flow" && method === "GET") {
    const months = computeCashFlow(access, 12);
    return json({ months });
  }

  // Report: spending by category
  if (pathname === "/api/reports/spending" && method === "GET") {
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const cats = computeSpendingByCategory(access, startDate, endDate);
    const categories = cats.map((c) => ({
      label: c.categoryName,
      value: Math.abs(c.amount),
      groupName: c.groupName,
    }));
    return json({ categories });
  }

  // Report: budget vs actuals
  if (pathname === "/api/reports/budget-analysis" && method === "GET") {
    const now = new Date();
    const monthInt = now.getFullYear() * 100 + (now.getMonth() + 1);
    const result = computeMonthBudget(access, monthInt);
    const categories = (result?.categories ?? []).map((c) => ({
      category: c.categoryName,
      budgeted: c.budgeted,
      actual: c.spent,
    }));
    return json({ categories });
  }

  // Report: age of money
  if (pathname === "/api/reports/age-of-money" && method === "GET") {
    const days = computeAgeOfMoney(access);
    return json({ days });
  }

  // Report: FI-RE crossover projection
  if (pathname === "/api/reports/crossover" && method === "GET") {
    const result = computeCrossoverProjection(access);
    return json(result ?? { error: "Not enough data" }, result ? 200 : 400);
  }

  // Report: calendar heatmap
  if (pathname === "/api/reports/calendar-heatmap" && method === "GET") {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const days = computeDailySpending(access, monthKey);
    return json({ monthKey, days });
  }

  // Custom reports list
  if (pathname === "/api/reports/custom" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      "SELECT * FROM custom_reports ORDER BY created_at DESC",
    );
    return json({ reports: rows });
  }

  // Dashboard widgets
  if (pathname === "/api/dashboard/widgets" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      "SELECT * FROM dashboard_widgets ORDER BY y, x",
    );
    return json({ widgets: rows.map(mapDashboardWidgetRow) });
  }

  // CSV export
  if (pathname === "/api/export/csv" && method === "GET") {
    const rows = access.queryAll<Record<string, unknown>>(
      `SELECT t.date, t.amount, t.payee, c.name as category,
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
        `"${(r.payee as string) ?? ""}"`,
        `"${(r.category as string) ?? ""}"`,
        `"${(r.notes as string) ?? ""}"`,
        `"${(r.account as string) ?? ""}"`,
      ].join(","),
    );
    const csv = header + csvLines.join("\n");

    return new Response(csv, {
      headers: {
        "content-type": "text/csv",
        "content-disposition": 'attachment; filename="shedflare-export.csv"',
      },
    });
  }

  return null;
}

function mapAccountRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    offbudget: Number(row.offbudget ?? 0) === 1,
    closed: Number(row.closed ?? 0) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    balanceCurrent: Number(row.balance_current ?? 0),
    lastReconciled: row.last_reconciled ? (row.last_reconciled as string) : null,
  };
}

function mapDashboardWidgetRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    type: String(row.type),
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    meta: row.meta ? (row.meta as string) : null,
  };
}

function mapCategoryGroupRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    isIncome: Number(row.is_income ?? 0) === 1,
    sortOrder: Number(row.sort_order ?? 0),
    hidden: Number(row.hidden ?? 0) === 1,
  };
}
