/**
 * API response types — derived from Drizzle schema as the single source of truth.
 *
 * These types flow DB → API → client without manual duplication.
 * Use `satisfies` checks to keep them in sync with the Drizzle schema.
 */
import type * as s from "../db/schema";

// -- Account --------------------------------------------------------------
export interface AccountApi {
  id: string;
  name: string;
  offbudget: boolean;
  closed: boolean;
  sortOrder: number;
  balanceCurrent: number;
  lastReconciled: string | null;
}

// -- Category -------------------------------------------------------------
export interface CategoryApi {
  id: string;
  name: string;
  isIncome: boolean;
  groupId: string | null;
  sortOrder: number;
  hidden: boolean;
  goalDef: string | null;
  createdAt: string;
  updatedAt: string;
  group_name?: string | null;
}

export type CategoryGroupApi = s.CategoryGroup;

// -- Transaction (API shape: includes joined names) -----------------------
export interface TransactionApi {
  id: string;
  accountId: string;
  categoryId: string | null;
  amount: number;
  payee: string | null;
  notes: string | null;
  date: string;
  cleared: boolean;
  reconciled: boolean;
  importedDescription: string | null;
  startingBalanceFlag: boolean;
  sortOrder: number | null;
  isParent: boolean;
  isChild: boolean;
  parentId: string | null;
  transferId: string | null;
  scheduleId: string | null;
  createdAt: string;
  updatedAt: string;
  categoryName?: string | null;
  accountName?: string | null;
  scheduleName?: string | null;
}

// -- Budget ---------------------------------------------------------------
export interface CategoryBudgetRowApi {
  categoryId: string;
  categoryName: string;
  groupId: string | null;
  groupName: string | null;
  budgeted: number;
  spent: number;
  leftover: number;
  leftoverPos: number;
  carryover: boolean;
}

export interface MonthBudgetApi {
  month: number;
  toBudget: number;
  buffered: number;
  categories: CategoryBudgetRowApi[];
}

// -- Payee ----------------------------------------------------------------
export interface PayeeApi {
  id: string;
  name: string;
  transferAccountId: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  transaction_count: number;
}

// -- Schedule -------------------------------------------------------------
export type ScheduleApi = s.Schedule;

export interface ScheduleDetailApi extends ScheduleApi {
  account_name?: string | null;
  payee_name?: string | null;
  category_name?: string | null;
  group_name?: string | null;
}

// -- Rule -----------------------------------------------------------------
export type RuleApi = s.Rule;

// -- Tag ------------------------------------------------------------------
export type TagApi = s.Tag;

export interface TransactionTagApi {
  transactionId: string;
  tagId: string;
  tagName: string;
  tagColor: string | null;
}

// -- Filter ---------------------------------------------------------------
export type FilterApi = s.TransactionFilter;

// -- Dashboard ------------------------------------------------------------
export type DashboardWidgetApi = s.DashboardWidget;

// -- Exchange rate --------------------------------------------------------
export interface ExchangeRateApi {
  id: string;
  usdToIdr: number;
  updatedAt: string;
}

// -- Budget overview ------------------------------------------------------
export interface BudgetOverviewApi {
  netWorth: number;
  onBudget: number;
  accountCount: number;
  income: number;
  expense: number;
}

// -- Reports --------------------------------------------------------------
export interface NetWorthPoint {
  date: string;
  value: number;
}

export interface CashFlowMonth {
  month: string;
  income: number;
  expense: number;
}

export interface SpendingCategory {
  label: string;
  value: number;
  groupName: string | null;
}

export interface CategorySuggestion {
  category_id: string;
  category_name: string;
  group_name: string | null;
  count: number;
}
