import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const errorLogs = sqliteTable("error_logs", {
  id: text("id").primaryKey(),
  outcome: text("outcome").notNull(),
  scriptName: text("script_name").notNull(),
  method: text("method"),
  url: text("url"),
  status: integer("status"),
  exceptionName: text("exception_name"),
  exceptionMessage: text("exception_message"),
  stack: text("stack"),
  cpuTimeUs: integer("cpu_time_us"),
  createdAt: text("created_at").notNull(),
});

export type ErrorLog = typeof errorLogs.$inferSelect;
export type NewErrorLog = typeof errorLogs.$inferInsert;
