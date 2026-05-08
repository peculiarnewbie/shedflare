import * as Schema from "effect/Schema";
import { NullableString, TransactionInput, ScheduleInput, RuleInput, CustomReportInput, ParsedTransaction, type SyncCommandType } from "./types";

// ---------------------------------------------------------------------------
// Each command is defined as an Effect/Schema struct.
// The CommandPayloadMap maps command type → payload schema.
// ---------------------------------------------------------------------------

// Effect Schema validators for each command type (used for validation in command handlers)
export const CommandPayloadSchemas: Record<string, Schema.Schema<any>> = {
  create_account: Schema.Struct({
    name: Schema.String,
    offBudget: Schema.optional(Schema.Boolean),
    balance: Schema.optional(Schema.Number),
  }),

  update_account: Schema.Struct({
    id: Schema.String,
    name: Schema.optional(Schema.String),
    offBudget: Schema.optional(Schema.Boolean),
  }),

  close_account: Schema.Struct({
    id: Schema.String,
    transferAccountId: Schema.optional(NullableString),
  }),

  reopen_account: Schema.Struct({
    id: Schema.String,
  }),

  reorder_accounts: Schema.Struct({
    ids: Schema.Array(Schema.String),
  }),

  create_transaction: Schema.Struct({
    row: TransactionInput,
  }),

  update_transaction: Schema.Struct({
    id: Schema.String,
    fields: Schema.Struct({
      accountId: Schema.optional(Schema.String),
      categoryId: Schema.optional(NullableString),
      amount: Schema.optional(Schema.Number),
      payee: Schema.optional(Schema.String),
      notes: Schema.optional(Schema.String),
      date: Schema.optional(Schema.String),
      cleared: Schema.optional(Schema.Boolean),
      importedDescription: Schema.optional(Schema.String),
      sortOrder: Schema.optional(Schema.Number),
    }),
  }),

  delete_transaction: Schema.Struct({
    id: Schema.String,
  }),

  split_transaction: Schema.Struct({
    parentId: Schema.String,
    children: Schema.Array(TransactionInput),
  }),

  import_transactions: Schema.Struct({
    accountId: Schema.String,
    transactions: Schema.Array(ParsedTransaction),
    isPreview: Schema.optional(Schema.Boolean),
  }),

  set_budget_amount: Schema.Struct({
    month: Schema.Number,
    categoryId: Schema.String,
    amount: Schema.Number,
  }),

  set_budget_carryover: Schema.Struct({
    month: Schema.Number,
    categoryId: Schema.String,
    carryover: Schema.Boolean,
  }),

  set_buffer: Schema.Struct({
    month: Schema.String,
    amount: Schema.Number,
  }),

  copy_previous_month: Schema.Struct({
    month: Schema.String,
  }),

  set_3month_avg: Schema.Struct({
    month: Schema.String,
  }),

  set_nmonth_avg: Schema.Struct({
    month: Schema.String,
    months: Schema.Number,
  }),

  set_zero: Schema.Struct({
    month: Schema.String,
  }),

  apply_goal_templates: Schema.Struct({
    month: Schema.String,
  }),

  cover_overspending: Schema.Struct({
    month: Schema.String,
    from: Schema.String,
    to: Schema.String,
    amount: Schema.optional(Schema.Number),
  }),

  transfer_budget: Schema.Struct({
    month: Schema.String,
    from: Schema.String,
    to: Schema.String,
    amount: Schema.Number,
  }),

  hold_for_next_month: Schema.Struct({
    month: Schema.String,
    amount: Schema.Number,
  }),

  create_category: Schema.Struct({
    name: Schema.String,
    groupId: Schema.String,
    isIncome: Schema.optional(Schema.Boolean),
  }),

  update_category: Schema.Struct({
    id: Schema.String,
    name: Schema.optional(Schema.String),
    hidden: Schema.optional(Schema.Boolean),
    groupId: Schema.optional(NullableString),
  }),

  delete_category: Schema.Struct({
    id: Schema.String,
    transferToId: Schema.optional(NullableString),
  }),

  create_category_group: Schema.Struct({
    name: Schema.String,
    isIncome: Schema.optional(Schema.Boolean),
  }),

  update_category_group: Schema.Struct({
    id: Schema.String,
    name: Schema.optional(Schema.String),
    hidden: Schema.optional(Schema.Boolean),
  }),

  reorder_categories: Schema.Struct({
    ids: Schema.Array(Schema.String),
  }),

  create_payee: Schema.Struct({
    name: Schema.String,
  }),

  update_payee: Schema.Struct({
    id: Schema.String,
    name: Schema.optional(Schema.String),
    favorite: Schema.optional(Schema.Boolean),
  }),

  merge_payees: Schema.Struct({
    targetId: Schema.String,
    sourceIds: Schema.Array(Schema.String),
  }),

  create_schedule: Schema.Struct({
    schedule: ScheduleInput,
  }),

  update_schedule: Schema.Struct({
    id: Schema.String,
    fields: ScheduleInput,
  }),

  delete_schedule: Schema.Struct({
    id: Schema.String,
  }),

  skip_schedule_date: Schema.Struct({
    id: Schema.String,
  }),

  post_schedule_transaction: Schema.Struct({
    scheduleId: Schema.String,
  }),

  create_rule: Schema.Struct({
    rule: RuleInput,
  }),

  update_rule: Schema.Struct({
    id: Schema.String,
    fields: RuleInput,
  }),

  delete_rule: Schema.Struct({
    id: Schema.String,
  }),

  create_tag: Schema.Struct({
    name: Schema.String,
    color: Schema.optional(Schema.String),
  }),

  delete_tag: Schema.Struct({
    id: Schema.String,
  }),

  create_report: Schema.Struct({
    report: CustomReportInput,
  }),

  update_report: Schema.Struct({
    id: Schema.String,
    fields: CustomReportInput,
  }),

  delete_report: Schema.Struct({
    id: Schema.String,
  }),

  update_dashboard: Schema.Struct({
    widgets: Schema.Array(Schema.Struct({
      id: Schema.String,
      type: Schema.String,
      x: Schema.Number,
      y: Schema.Number,
      width: Schema.Number,
      height: Schema.Number,
      meta: Schema.optional(NullableString),
    })),
  }),

  update_exchange_rate: Schema.Struct({
    usdToIdr: Schema.Number,
  }),
};

// ---------------------------------------------------------------------------
// Typed command payload maps
// ---------------------------------------------------------------------------
export interface CommandPayloadMap {
  create_account: { name: string; offBudget?: boolean; balance?: number };
  update_account: { id: string; name?: string; offBudget?: boolean };
  close_account: { id: string; transferAccountId?: string | null };
  reopen_account: { id: string };
  reorder_accounts: { ids: string[] };
  create_transaction: { row: import("./types").TransactionInput };
  update_transaction: { id: string; fields: Partial<import("./types").TransactionInput> };
  delete_transaction: { id: string };
  split_transaction: { parentId: string; children: import("./types").TransactionInput[] };
  import_transactions: { accountId: string; transactions: import("./types").ParsedTransaction[]; isPreview?: boolean };
  set_budget_amount: { month: number; categoryId: string; amount: number };
  set_budget_carryover: { month: number; categoryId: string; carryover: boolean };
  set_buffer: { month: string; amount: number };
  copy_previous_month: { month: string };
  set_3month_avg: { month: string };
  set_nmonth_avg: { month: string; months: number };
  set_zero: { month: string };
  apply_goal_templates: { month: string };
  cover_overspending: { month: string; from: string; to: string; amount?: number };
  transfer_budget: { month: string; from: string; to: string; amount: number };
  hold_for_next_month: { month: string; amount: number };
  create_category: { name: string; groupId: string; isIncome?: boolean };
  update_category: { id: string; name?: string; hidden?: boolean; groupId?: string | null };
  delete_category: { id: string; transferToId?: string | null };
  create_category_group: { name: string; isIncome?: boolean };
  update_category_group: { id: string; name?: string; hidden?: boolean };
  reorder_categories: { ids: string[] };
  create_payee: { name: string };
  update_payee: { id: string; name?: string; favorite?: boolean };
  merge_payees: { targetId: string; sourceIds: string[] };
  create_schedule: { schedule: import("./types").ScheduleInput };
  update_schedule: { id: string; fields: import("./types").ScheduleInput };
  delete_schedule: { id: string };
  skip_schedule_date: { id: string };
  post_schedule_transaction: { scheduleId: string };
  create_rule: { rule: import("./types").RuleInput };
  update_rule: { id: string; fields: import("./types").RuleInput };
  delete_rule: { id: string };
  create_tag: { name: string; color?: string };
  delete_tag: { id: string };
  create_report: { report: import("./types").CustomReportInput };
  update_report: { id: string; fields: import("./types").CustomReportInput };
  delete_report: { id: string };
  update_dashboard: { widgets: Array<{ id: string; type: string; x: number; y: number; width: number; height: number; meta?: string | null }> };
  update_exchange_rate: { usdToIdr: number };
}

export type SyncCommandPayloadMap = {
  [K in SyncCommandType]: CommandPayloadMap[K];
};
