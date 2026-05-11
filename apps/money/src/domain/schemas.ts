import { createSelectSchema, createInsertSchema } from "drizzle-orm/effect-schema";
import * as Schema from "effect/Schema";
import * as schema from "../db/schema";

export const AccountSchema = createSelectSchema(schema.accounts);
export const TransactionSchema = createSelectSchema(schema.transactions);
export const CategorySchema = createSelectSchema(schema.categories);
export const CategoryGroupSchema = createSelectSchema(schema.categoryGroups);
export const PayeeSchema = createSelectSchema(schema.payees);
export const ScheduleSchema = createSelectSchema(schema.schedules);
export const RuleSchema = createSelectSchema(schema.rules);
export const TagSchema = createSelectSchema(schema.tags);
export const CustomReportSchema = createSelectSchema(schema.customReports);
export const DashboardWidgetSchema = createSelectSchema(schema.dashboardWidgets);
export const ExchangeRateSchema = createSelectSchema(schema.exchangeRates);

export const BudgetSchema = createSelectSchema(schema.budgets);
export const BudgetMonthSchema = createSelectSchema(schema.budgetMonths);

// Command input schemas (derive from Drizzle insert, strip server-managed fields)
function omitFields<T extends Schema.Struct<any>>(
  struct: T,
  ...keys: Array<keyof T["fields"]>
): Schema.Struct<Omit<T["fields"], (typeof keys)[number]>> {
  const { ...all } = struct.fields;
  for (const key of keys) {
    delete (all as any)[key];
  }
  return Schema.Struct(all as any) as any;
}

export const TransactionInput = omitFields(
  createInsertSchema(schema.transactions),
  "id",
  "createdAt",
  "updatedAt",
);
export const ScheduleInput = omitFields(
  createInsertSchema(schema.schedules),
  "id",
  "createdAt",
  "updatedAt",
);
export const RuleInput = omitFields(
  createInsertSchema(schema.rules),
  "id",
  "createdAt",
  "updatedAt",
);
export const CustomReportInput = omitFields(
  createInsertSchema(schema.customReports),
  "id",
  "createdAt",
  "updatedAt",
);
export const DashboardWidgetInput = omitFields(
  createInsertSchema(schema.dashboardWidgets),
  "createdAt",
  "updatedAt",
);

// Shared nullable helpers
export const NullableString = Schema.NullOr(Schema.String);
export const NullableNumber = Schema.NullOr(Schema.Number);

// Parsed transaction (from CSV import)
export const ParsedTransaction = Schema.Struct({
  date: Schema.String,
  amount: Schema.Number,
  payee: Schema.optional(Schema.String),
  notes: Schema.optional(Schema.String),
  category: Schema.optional(Schema.String),
  importedDescription: Schema.optional(Schema.String),
});
export type ParsedTransaction = Schema.Schema.Type<typeof ParsedTransaction>;
