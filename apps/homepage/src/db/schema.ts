import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const experiences = sqliteTable("experiences", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  workplace: text("workplace").notNull(),
  url: text("url").notNull(),
  tags: text("tags").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  body: text("body").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  showOnHome: integer("show_on_home", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  tags: text("tags").notNull(),
  image: text("image").notNull(),
  url: text("url").notNull(),
  githubUrl: text("github_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  desc: text("desc").notNull(),
  showOnHome: integer("show_on_home", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export type ExperienceRow = typeof experiences.$inferSelect;
export type NewExperienceRow = typeof experiences.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
