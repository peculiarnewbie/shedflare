/**
 * Budget Engine — computes derived budget values from base data.
 *
 * This replaces Actual's reactive spreadsheet engine with SQL computed queries.
 * Budget values (leftover, to_budget, etc.) are derived state, computed on demand
 * and broadcast as events to clients.
 */
import type { DataAccess } from "./data-access";
import { monthBoundaries, prevMonthKey, fromMonthInt, toMonthInt } from "../domain/types";
import type { MonthBudgetSummary, CategoryBudgetRow } from "../domain/types";

export interface BudgetRecalculationResult {
  month: number;
  toBudget: number;
  buffered: number;
  categories: CategoryBudgetRow[];
  categoryLeftovers: Array<{
    categoryId: string;
    leftover: number;
    leftoverPos: number;
    budgeted: number;
    spent: number;
  }>;
}

/**
 * Compute full budget for a given month.
 * This is the main entry point for budget computation.
 */
export function computeMonthBudget(
  access: DataAccess,
  month: number,
  monthKey?: string,
): BudgetRecalculationResult | null {
  const mk = monthKey ?? fromMonthInt(month);
  const boundaries = monthBoundaries(mk);

  // Get all non-hidden categories with their groups
  const cats = access.queryAll<Record<string, unknown>>(
    `SELECT c.id, c.name, c.is_income, c.group_id, c.hidden, c.goal_def, c.sort_order,
            cg.name as group_name, cg.sort_order as group_sort_order
     FROM categories c
     LEFT JOIN category_groups cg ON c.group_id = cg.id
     WHERE c.hidden = 0
     ORDER BY cg.sort_order, c.sort_order`,
  );

  if (cats.length === 0) return null;

  // Get spending for this month per category
  const spending = access.getCategorySpending(month);
  const spendingMap = new Map(spending.map((s) => [s.categoryId, s.spent]));

  // Get budgets for this month
  const budgetRows = access.queryAll<{ category_id: string; amount: number; carryover: number }>(
    `SELECT category_id, amount, carryover FROM budgets WHERE month = ?`,
    month,
  );
  const budgetMap = new Map(budgetRows.map((b) => [String(b.category_id), { amount: Number(b.amount), carryover: Boolean(b.carryover) }]));

  // Get previous month's leftovers for carryover
  const prevMk = prevMonthKey(mk);
  const prevMonth = toMonthInt(prevMk);
  const prevLeftovers = getMonthLeftovers(access, prevMonth, prevMk);

  // Get buffered amount
  const budgetMonth = access.getBudgetMonth(mk);
  const buffered = budgetMonth?.buffered ?? 0;

  // Compute per-category leftovers
  const categoryRows: CategoryBudgetRow[] = [];
  let totalIncome = 0;
  let totalBudgeted = 0;

  for (const cat of cats) {
    const categoryId = String(cat.id);
    const isIncome = Boolean(cat.is_income);
    const budget = budgetMap.get(categoryId);
    const budgeted = budget?.amount ?? 0;
    const carryover = budget?.carryover ?? false;
    const spent = spendingMap.get(categoryId) ?? 0;
    const prevLeftover = prevLeftovers.get(categoryId);
    const prevLeftoverVal = prevLeftover?.leftover ?? 0;
    const prevLeftoverPosVal = prevLeftover?.leftoverPos ?? 0;

    // Core envelope formula:
    // leftover = budgeted + sum_amount + (carryover ? prev_leftover : max(prev_leftover, 0))
    const carryoverAmount = carryover ? prevLeftoverVal : Math.max(prevLeftoverPosVal, 0);
    const leftover = budgeted + spent + carryoverAmount;
    const leftoverPos = Math.max(leftover, 0);

    if (isIncome) {
      totalIncome += spent; // income is positive in amount
    }
    totalBudgeted += budgeted;

    categoryRows.push({
      categoryId,
      categoryName: String(cat.name),
      groupId: cat.group_id ? String(cat.group_id) : null,
      groupName: cat.group_name ? String(cat.group_name) : null,
      budgeted,
      spent,
      leftover,
      leftoverPos,
      carryover,
    });
  }

  // to_budget = total_income - total_budgeted - buffered
  const toBudget = totalIncome - totalBudgeted - buffered;

  const categoryLeftovers = categoryRows.map((c) => ({
    categoryId: c.categoryId,
    leftover: c.leftover,
    leftoverPos: c.leftoverPos,
    budgeted: c.budgeted,
    spent: c.spent,
  }));

  return {
    month,
    toBudget,
    buffered,
    categories: categoryRows,
    categoryLeftovers,
  };
}

interface LeftoverInfo {
  leftover: number;
  leftoverPos: number;
}

/**
 * Get per-category leftovers for a given month.
 */
function getMonthLeftovers(
  access: DataAccess,
  month: number,
  monthKey: string,
): Map<string, LeftoverInfo> {
  const result = new Map<string, LeftoverInfo>();
  const boundaries = monthBoundaries(monthKey);

  // Get all categories
  const cats = access.queryAll<{ id: string }>(
    `SELECT id FROM categories WHERE hidden = 0`,
  );

  // Get spending
  const spending = access.getCategorySpending(month);
  const spendingMap = new Map(spending.map((s) => [s.categoryId, s.spent]));

  // Get budgets
  const budgetRows = access.queryAll<{ category_id: string; amount: number; carryover: number }>(
    `SELECT category_id, amount, carryover FROM budgets WHERE month = ?`,
    month,
  );

  for (const cat of cats) {
    const categoryId = String(cat.id);
    const budget = budgetRows.find((b) => String(b.category_id) === categoryId);
    const budgeted = budget ? Number(budget.amount) : 0;
    const carryover = budget ? Boolean(budget.carryover) : false;
    const spent = spendingMap.get(categoryId) ?? 0;

    // For computing prev leftovers, we don't cascade carryover (that would be infinite recursion)
    const leftover = budgeted + spent;
    const leftoverPos = Math.max(leftover, 0);

    result.set(categoryId, { leftover, leftoverPos });
  }

  return result;
}

/**
 * Compute net worth across all accounts.
 */
export function computeNetWorth(access: DataAccess): number {
  const rows = access.queryAll<{ balance_current: number | null }>(
    `SELECT balance_current FROM accounts WHERE closed = 0`,
  );
  return rows.reduce((sum, r) => sum + (Number(r.balance_current) ?? 0), 0);
}

/**
 * Compute net worth history over time.
 * Uses transaction data to reconstruct balance at each month boundary.
 */
export function computeNetWorthHistory(
  access: DataAccess,
  monthsBack: number = 12,
): Array<{ month: string; netWorth: number }> {
  const now = new Date();
  const results: Array<{ month: string; netWorth: number }> = [];

  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const endDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

    const row = access.queryOne<{ total: number | null }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE date < ? AND account_id IN (SELECT id FROM accounts WHERE closed = 0)`,
      endDate,
    );

    // Get starting balances
    const startingRow = access.queryOne<{ total: number | null }>(
      `SELECT COALESCE(SUM(balance_current), 0) AS total FROM accounts WHERE closed = 0 AND balance_current IS NOT NULL`,
    );

    const transactionTotal = Number(row?.total ?? 0);
    const startingBalance = Number(startingRow?.total ?? 0);
    results.push({ month: mk, netWorth: startingBalance + transactionTotal });
  }

  return results;
}

/**
 * Compute cash flow for a range of months.
 */
export function computeCashFlow(
  access: DataAccess,
  monthsBack: number = 12,
): Array<{ month: string; income: number; expense: number }> {
  const now = new Date();
  const results: Array<{ month: string; income: number; expense: number }> = [];

  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const boundaries = monthBoundaries(mk);

    const income = access.getIncomeTotal(boundaries.start, boundaries.end);

    const expenseRow = access.queryOne<{ total: number | null }>(
      `SELECT COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.date >= ? AND t.date < ? AND c.is_income = 0 AND t.is_child = 0`,
      boundaries.start,
      boundaries.end,
    );
    const expense = Number(expenseRow?.total ?? 0);

    results.push({ month: mk, income, expense });
  }

  return results;
}

/**
 * Compute spending by category for a given month or range.
 */
export function computeSpendingByCategory(
  access: DataAccess,
  startDate: string,
  endDate: string,
): Array<{ categoryId: string; categoryName: string; amount: number; groupName: string | null }> {
  const rows = access.queryAll<Record<string, unknown>>(
    `SELECT c.id, c.name, cg.name as group_name, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN categories c ON t.category_id = c.id
     LEFT JOIN category_groups cg ON c.group_id = cg.id
     WHERE t.date >= ? AND t.date < ? AND t.is_child = 0 AND c.hidden = 0
     GROUP BY c.id
     ORDER BY total DESC`,
    startDate,
    endDate,
  );

  return rows.map((r) => ({
    categoryId: String(r.id),
    categoryName: String(r.name),
    amount: Number(r.total),
    groupName: r.group_name ? String(r.group_name) : null,
  }));
}

/**
 * Compute age of money (how many days your money lasts).
 * Simplified: (current cash / average daily spending) * 30
 */
export function computeAgeOfMoney(access: DataAccess): number | null {
  // Get total current balance of on-budget accounts
  const balanceRow = access.queryOne<{ total: number | null }>(
    `SELECT COALESCE(SUM(balance_current), 0) AS total FROM accounts WHERE offbudget = 0 AND closed = 0`,
  );
  const currentCash = Number(balanceRow?.total ?? 0);
  if (currentCash <= 0) return null;

  // Get average daily spending over last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const startDate = ninetyDaysAgo.toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);

  const spendingRow = access.queryOne<{ total: number | null }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN categories c ON t.category_id = c.id
     WHERE t.date >= ? AND t.date < ? AND c.is_income = 0 AND t.is_child = 0`,
    startDate,
    endDate,
  );
  const totalSpending = Number(spendingRow?.total ?? 0);
  const avgDaily = totalSpending / 90;
  if (avgDaily <= 0) return null;

  return Math.round(currentCash / avgDaily);
}
