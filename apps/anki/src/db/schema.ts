import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const decks = sqliteTable(
  "decks",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    color: text("color").notNull().default("#d87c4a"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_decks_updated_at").on(table.updatedAt)],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    note: text("note").notNull().default(""),
    tags: text("tags").notNull().default(""),
    dueAt: text("due_at").notNull(),
    intervalDays: integer("interval_days").notNull().default(0),
    easeFactor: integer("ease_factor").notNull().default(250),
    repetitions: integer("repetitions").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_cards_deck_id").on(table.deckId),
    index("idx_cards_due_at").on(table.dueAt),
    index("idx_cards_suspended_due_at").on(table.suspended, table.dueAt),
  ],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    grade: text("grade", { enum: ["again", "hard", "good", "easy"] }).notNull(),
    reviewedAt: text("reviewed_at").notNull(),
    nextDueAt: text("next_due_at").notNull(),
    intervalDays: integer("interval_days").notNull(),
    easeFactor: integer("ease_factor").notNull(),
  },
  (table) => [index("idx_reviews_card_id_reviewed_at").on(table.cardId, table.reviewedAt)],
);

export type DeckRow = typeof decks.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;
export type ReviewGrade = ReviewRow["grade"];
