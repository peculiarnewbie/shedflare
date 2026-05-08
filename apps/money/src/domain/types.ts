import * as Schema from "effect/Schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const SYNC_PROTOCOL_VERSION = "money-v1";

export const SYNC_COMMAND_TYPES = [
  "create_account",
  "update_account",
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
  "create_report",
  "update_report",
  "delete_report",
  "update_dashboard",
  "update_exchange_rate",
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
// SyncTables — generic record-of-records for snapshots
// ---------------------------------------------------------------------------
export type SyncTables = Record<string, Record<string, unknown>>;

// ---------------------------------------------------------------------------
// SyncSnapshot
// ---------------------------------------------------------------------------
export interface SyncSnapshot {
  serverSeq?: number;
  tables: SyncTables;
}

// ---------------------------------------------------------------------------
// Schema helpers for Effect/Schema validation
// ---------------------------------------------------------------------------
export const NullableString = Schema.NullOr(Schema.String);
export const NullableNumber = Schema.NullOr(Schema.Number);
// Simple branded string types (avoid Schema.filter which may not exist in this version)
export type IsoDateString = string;
export type IsoTimestamp = string;

// ---------------------------------------------------------------------------
// Transaction input (used by commands)
// ---------------------------------------------------------------------------
export const TransactionInput = Schema.Struct({
  accountId: Schema.String,
  categoryId: Schema.optional(NullableString),
  amount: Schema.Number,
  payee: Schema.optional(Schema.String),
  notes: Schema.optional(Schema.String),
  date: Schema.String,
  cleared: Schema.optional(Schema.Boolean),
  importedDescription: Schema.optional(Schema.String),
  startingBalanceFlag: Schema.optional(Schema.Boolean),
  sortOrder: Schema.optional(NullableNumber),
  isParent: Schema.optional(Schema.Boolean),
  isChild: Schema.optional(Schema.Boolean),
  parentId: Schema.optional(NullableString),
  transferId: Schema.optional(NullableString),
});
export type TransactionInput = Schema.Schema.Type<typeof TransactionInput>;

// ---------------------------------------------------------------------------
// Schedule input (used by commands)
// ---------------------------------------------------------------------------
export const ScheduleInput = Schema.Struct({
  name: Schema.optional(Schema.String),
  accountId: Schema.optional(NullableString),
  payeeId: Schema.optional(NullableString),
  categoryId: Schema.optional(NullableString),
  amount: Schema.optional(NullableNumber),
  startDate: Schema.optional(Schema.String),
  recurrenceRules: Schema.String,
  active: Schema.optional(Schema.Boolean),
  completed: Schema.optional(Schema.Boolean),
  postsTransaction: Schema.optional(Schema.Boolean),
  customUpcomingLength: Schema.optional(NullableNumber),
  nextDate: Schema.optional(NullableString),
});
export type ScheduleInput = Schema.Schema.Type<typeof ScheduleInput>;

// ---------------------------------------------------------------------------
// Rule input (used by commands)
// ---------------------------------------------------------------------------
export const RuleInput = Schema.Struct({
  stage: Schema.optional(Schema.String),
  conditionsOp: Schema.optional(Schema.String),
  conditions: Schema.String,
  actions: Schema.String,
});
export type RuleInput = Schema.Schema.Type<typeof RuleInput>;

// ---------------------------------------------------------------------------
// Custom report input (used by commands)
// ---------------------------------------------------------------------------
export const CustomReportInput = Schema.Struct({
  name: Schema.optional(Schema.String),
  startDate: Schema.optional(NullableString),
  endDate: Schema.optional(NullableString),
  dateStatic: Schema.optional(Schema.Boolean),
  dateRange: Schema.optional(NullableString),
  mode: Schema.optional(NullableString),
  groupBy: Schema.optional(NullableString),
  sortBy: Schema.optional(Schema.String),
  interval: Schema.optional(NullableString),
  balanceType: Schema.optional(NullableString),
  showEmpty: Schema.optional(Schema.Boolean),
  showOffbudget: Schema.optional(Schema.Boolean),
  showHidden: Schema.optional(Schema.Boolean),
  showUncategorized: Schema.optional(Schema.Boolean),
  trimIntervals: Schema.optional(Schema.Boolean),
  includeCurrent: Schema.optional(Schema.Boolean),
  graphType: Schema.optional(NullableString),
  conditions: Schema.optional(Schema.String),
  conditionsOp: Schema.optional(Schema.String),
  metadata: Schema.optional(NullableString),
});
export type CustomReportInput = Schema.Schema.Type<typeof CustomReportInput>;

// ---------------------------------------------------------------------------
// Dashboard widget input
// ---------------------------------------------------------------------------
export const DashboardWidgetInput = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  meta: Schema.optional(NullableString),
});
export type DashboardWidgetInput = Schema.Schema.Type<typeof DashboardWidgetInput>;

// ---------------------------------------------------------------------------
// Parsed transaction (from import)
// ---------------------------------------------------------------------------
export const ParsedTransaction = Schema.Struct({
  date: Schema.String,
  amount: Schema.Number,
  payee: Schema.optional(Schema.String),
  notes: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  importedDescription: Schema.optional(Schema.String),
});
export type ParsedTransaction = Schema.Schema.Type<typeof ParsedTransaction>;
