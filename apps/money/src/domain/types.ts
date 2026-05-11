// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const SYNC_PROTOCOL_VERSION = "money-v1";

export const SYNC_COMMAND_TYPES = [
  "create_account",
  "update_account",
  "delete_account",
  "close_account",
  "reopen_account",
  "reorder_accounts",
  "create_transaction",
  "update_transaction",
  "delete_transaction",
  "split_transaction",
  "import_transactions",
  "set_budget_amount",
  "set_budget_carryover",
  "set_buffer",
  "copy_previous_month",
  "set_3month_avg",
  "set_nmonth_avg",
  "set_zero",
  "apply_goal_templates",
  "cover_overspending",
  "transfer_budget",
  "hold_for_next_month",
  "create_category",
  "update_category",
  "delete_category",
  "create_category_group",
  "update_category_group",
  "reorder_categories",
  "create_payee",
  "update_payee",
  "merge_payees",
  "create_schedule",
  "update_schedule",
  "delete_schedule",
  "skip_schedule_date",
  "post_schedule_transaction",
  "create_rule",
  "update_rule",
  "delete_rule",
  "create_tag",
  "delete_tag",
  "add_transaction_tag",
  "remove_transaction_tag",
  "create_report",
  "update_report",
  "delete_report",
  "update_dashboard",
  "update_exchange_rate",
  "update_setting",
] as const;

export type SyncCommandType = (typeof SYNC_COMMAND_TYPES)[number];

export function isSyncCommandType(value: unknown): value is SyncCommandType {
  return typeof value === "string" && SYNC_COMMAND_TYPES.includes(value as SyncCommandType);
}

// ---------------------------------------------------------------------------
// Branded types
// ---------------------------------------------------------------------------
export type AccountId = string & { readonly __brand: "AccountId" };
export type TransactionId = string & { readonly __brand: "TransactionId" };
export type CategoryId = string & { readonly __brand: "CategoryId" };
export type CategoryGroupId = string & { readonly __brand: "CategoryGroupId" };
export type PayeeId = string & { readonly __brand: "PayeeId" };
export type ScheduleId = string & { readonly __brand: "ScheduleId" };
export type RuleId = string & { readonly __brand: "RuleId" };
export type TagId = string & { readonly __brand: "TagId" };
export type ReportId = string & { readonly __brand: "ReportId" };
export type WidgetId = string & { readonly __brand: "WidgetId" };
export type EventId = string & { readonly __brand: "EventId" };
export type OpId = string & { readonly __brand: "OpId" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

/** Cast a known-valid string to a branded ID type. Use at trust boundaries (after validation). */
export function castId<T extends string>(id: string): T {
  return id as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toMonthInt(monthKey: string): number {
  // "2026-04" → 202604
  const [y, m] = monthKey.split("-").map(Number);
  return y * 100 + m;
}

export function fromMonthInt(monthInt: number): string {
  // 202604 → "2026-04"
  const y = Math.floor(monthInt / 100);
  const m = monthInt % 100;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function budgetId(month: number, categoryId: string): string {
  return `${month}-${categoryId}`;
}

export function getCurrentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function getCurrentMonthInt(): number {
  return toMonthInt(getCurrentMonthKey());
}

export function monthBoundaries(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = new Date(y, m, 0);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
  return { start, end };
}

export function prevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Envelope budget computed values
// ---------------------------------------------------------------------------
export interface CategoryBudgetRow {
  categoryId: CategoryId;
  categoryName: string;
  groupId: CategoryGroupId | null;
  groupName: string | null;
  budgeted: number;
  spent: number;
  leftover: number;
  leftoverPos: number;
  carryover: boolean;
}

export interface MonthBudgetSummary {
  month: number;
  monthKey: string;
  totalIncome: number;
  totalBudgeted: number;
  totalSpent: number;
  toBudget: number;
  buffered: number;
  categories: CategoryBudgetRow[];
}

// ---------------------------------------------------------------------------
// SyncTables — per-table typed records for snapshots
// ---------------------------------------------------------------------------
import type {
  Account,
  Transaction,
  Category,
  CategoryGroup,
  Payee,
  Schedule,
  Rule,
  Tag,
  TransactionTag,
  Budget,
  BudgetMonth,
  CustomReport,
  DashboardWidget,
  ExchangeRate,
  Setting,
} from "../db/schema";

export type SyncTables = {
  accounts?: Record<string, Account>;
  transactions?: Record<string, Transaction>;
  categories?: Record<string, Category>;
  category_groups?: Record<string, CategoryGroup>;
  payees?: Record<string, Payee>;
  schedules?: Record<string, Schedule>;
  rules?: Record<string, Rule>;
  tags?: Record<string, Tag>;
  transaction_tags?: Record<string, TransactionTag>;
  budgets?: Record<string, Budget>;
  budget_months?: Record<string, BudgetMonth>;
  custom_reports?: Record<string, CustomReport>;
  dashboard_widgets?: Record<string, DashboardWidget>;
  exchange_rates?: Record<string, ExchangeRate>;
  settings?: Record<string, Setting>;
};

// ---------------------------------------------------------------------------
// SyncSnapshot
// ---------------------------------------------------------------------------
export interface SyncSnapshot {
  serverSeq?: number;
  tables: SyncTables;
}
