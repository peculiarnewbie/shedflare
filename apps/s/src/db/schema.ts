import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const links = sqliteTable("links", {
  slug: text("slug").primaryKey(),
  url: text("url").notNull(),
  hidePreview: integer("hide_preview", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type LinkRow = typeof links.$inferSelect;
export type NewLinkRow = typeof links.$inferInsert;
