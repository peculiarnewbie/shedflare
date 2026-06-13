import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const routines = sqliteTable(
  "routines",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#5b8def"),
    durationMinutes: integer("duration_minutes").notNull(),
    // 0 = daily routine; N > 0 = weekly quota of N completions per week.
    weeklyTarget: integer("weekly_target").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_routines_sort_order").on(table.sortOrder)],
);

export const routineCompletions = sqliteTable(
  "routine_completions",
  {
    id: text("id").primaryKey(),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    unique("routine_id_date").on(table.routineId, table.date),
    index("idx_routine_completions_date").on(table.date),
    index("idx_routine_completions_routine_date").on(table.routineId, table.date),
  ],
);

export type RoutineRow = typeof routines.$inferSelect;
export type NewRoutineRow = typeof routines.$inferInsert;
export type RoutineCompletionRow = typeof routineCompletions.$inferSelect;
export type NewRoutineCompletionRow = typeof routineCompletions.$inferInsert;
export type SettingRow = typeof settings.$inferSelect;
export type NewSettingRow = typeof settings.$inferInsert;
