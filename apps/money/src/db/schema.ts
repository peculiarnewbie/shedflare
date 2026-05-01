import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const monthlyItems = sqliteTable(
  "monthly_items",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type", { enum: ["income", "expense"] }).notNull(),
    amount: integer("amount").notNull(), // stored in smallest unit (cents for USD, rupiah for IDR)
    currency: text("currency", { enum: ["USD", "IDR"] })
      .notNull()
      .default("USD"),
    category: text("category").notNull().default("other"),
    note: text("note").default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_monthly_items_type").on(table.type),
    index("idx_monthly_items_category").on(table.category),
  ],
);

export const manualItems = sqliteTable(
  "manual_items",
  {
    id: text("id").primaryKey(),
    monthlyItemId: text("monthly_item_id").references(() => monthlyItems.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    type: text("type", { enum: ["income", "expense"] }).notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency", { enum: ["USD", "IDR"] })
      .notNull()
      .default("USD"),
    category: text("category").notNull().default("other"),
    note: text("note").default(""),
    monthKey: text("month_key").notNull(), // YYYY-MM
    date: text("date").notNull(), // YYYY-MM-DD
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_manual_items_month_key").on(table.monthKey),
    index("idx_manual_items_type").on(table.type),
    index("idx_manual_items_category").on(table.category),
  ],
);

export const monthlyToggles = sqliteTable(
  "monthly_toggles",
  {
    monthlyItemId: text("monthly_item_id")
      .notNull()
      .references(() => monthlyItems.id, { onDelete: "cascade" }),
    monthKey: text("month_key").notNull(), // YYYY-MM
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    unique("uq_monthly_toggle").on(table.monthlyItemId, table.monthKey),
    index("idx_monthly_toggles_month").on(table.monthKey),
  ],
);

export const exchangeRates = sqliteTable("exchange_rates", {
  id: text("id").primaryKey(), // always "latest"
  usdToIdr: integer("usd_to_idr").notNull(), // stored as integer (e.g., 16000 = 16,000 IDR per USD)
  updatedAt: text("updated_at").notNull(),
});

export type MonthlyItemRow = typeof monthlyItems.$inferSelect;
export type NewMonthlyItemRow = typeof monthlyItems.$inferInsert;
export type ManualItemRow = typeof manualItems.$inferSelect;
export type NewManualItemRow = typeof manualItems.$inferInsert;
export type MonthlyToggleRow = typeof monthlyToggles.$inferSelect;
export type ExchangeRateRow = typeof exchangeRates.$inferSelect;
