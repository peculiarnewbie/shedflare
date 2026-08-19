import { and, asc, count, desc, eq, lte, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import type { CardRow, ReviewGrade } from "../db/schema";
import type { Database } from "./db";
import { fallback, looseObject, optional, parse, picklist, string } from "valibot";

const DEFAULT_DECK_COLOR = "#d87c4a";

function json<Data>(data: Data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function addDaysIso(baseIso: string, days: number): string {
  const base = new Date(baseIso);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

function normalizeTags(value: string): string {
  return value
    .split(/[#,\s]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .join(",");
}

const TextFieldSchema = fallback(string(), "");
const CreateDeckSchema = looseObject({
  name: TextFieldSchema,
  description: TextFieldSchema,
  color: TextFieldSchema,
});
const CreateCardSchema = looseObject({
  deckId: TextFieldSchema,
  front: TextFieldSchema,
  back: TextFieldSchema,
  note: TextFieldSchema,
  tags: TextFieldSchema,
});
const ReviewCardSchema = looseObject({
  cardId: TextFieldSchema,
  grade: optional(picklist(["again", "hard", "good", "easy"])),
});

function schedule(card: CardRow, grade: ReviewGrade, reviewedAt: string) {
  if (grade === "again") {
    return {
      intervalDays: 0,
      easeFactor: Math.max(130, card.easeFactor - 20),
      repetitions: 0,
      lapses: card.lapses + 1,
      dueAt: addDaysIso(reviewedAt, 0),
    };
  }

  const easeFactor = Math.max(
    130,
    card.easeFactor + (grade === "easy" ? 15 : grade === "hard" ? -15 : 0),
  );
  const repetitions = card.repetitions + 1;
  const previousInterval = Math.max(1, card.intervalDays);
  const multiplier = grade === "hard" ? 1.2 : grade === "easy" ? 3.2 : easeFactor / 100;
  const intervalDays =
    repetitions === 1 ? 1 : Math.max(1, Math.round(previousInterval * multiplier));

  return {
    intervalDays,
    easeFactor,
    repetitions,
    lapses: card.lapses,
    dueAt: addDaysIso(reviewedAt, intervalDays),
  };
}

export async function overview(database: Database) {
  const now = nowIso();
  const [decks, cardCounts, dueCards, recentReviews] = await Promise.all([
    database.select().from(schema.decks).orderBy(desc(schema.decks.updatedAt)),
    database
      .select({ deckId: schema.cards.deckId, total: count() })
      .from(schema.cards)
      .groupBy(schema.cards.deckId),
    database
      .select()
      .from(schema.cards)
      .where(and(eq(schema.cards.suspended, false), lte(schema.cards.dueAt, now)))
      .orderBy(asc(schema.cards.dueAt))
      .limit(25),
    database.select().from(schema.reviews).orderBy(desc(schema.reviews.reviewedAt)).limit(12),
  ]);

  return json({ decks, cardCounts, dueCards, recentReviews, serverTime: now });
}

export async function createDeck<Body>(database: Database, body: Body) {
  const input = parse(CreateDeckSchema, body ?? {});
  const name = input.name.trim();
  if (!name) return json({ error: "Deck name is required" }, 400);

  const now = nowIso();
  const id = crypto.randomUUID();
  await database.insert(schema.decks).values({
    id,
    name,
    description: input.description.trim(),
    color: input.color.trim() || DEFAULT_DECK_COLOR,
    createdAt: now,
    updatedAt: now,
  });

  return json({ success: true, id });
}

export async function createCard<Body>(database: Database, body: Body) {
  const input = parse(CreateCardSchema, body ?? {});
  const deckId = input.deckId.trim();
  const front = input.front.trim();
  const back = input.back.trim();
  if (!deckId || !front || !back) {
    return json({ error: "Deck, front, and back are required" }, 400);
  }

  const deck = await database
    .select()
    .from(schema.decks)
    .where(eq(schema.decks.id, deckId))
    .limit(1);
  if (!deck[0]) return json({ error: "Deck not found" }, 404);

  const now = nowIso();
  const id = crypto.randomUUID();
  await database.insert(schema.cards).values({
    id,
    deckId,
    front,
    back,
    note: input.note.trim(),
    tags: normalizeTags(input.tags),
    dueAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await database.update(schema.decks).set({ updatedAt: now }).where(eq(schema.decks.id, deckId));

  return json({ success: true, id });
}

export async function listCards(database: Database, deckId: string | null) {
  const rows = deckId
    ? await database
        .select()
        .from(schema.cards)
        .where(eq(schema.cards.deckId, deckId))
        .orderBy(asc(schema.cards.dueAt))
    : await database.select().from(schema.cards).orderBy(asc(schema.cards.dueAt));
  return json({ cards: rows });
}

export async function reviewCard<Body>(database: Database, body: Body) {
  const input = parse(ReviewCardSchema, body ?? {});
  const cardId = input.cardId.trim();
  if (!cardId || !input.grade) {
    return json({ error: "cardId and grade are required" }, 400);
  }

  const card = await database
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.id, cardId))
    .limit(1);
  if (!card[0]) return json({ error: "Card not found" }, 404);

  const reviewedAt = nowIso();
  const next = schedule(card[0], input.grade, reviewedAt);
  await database
    .update(schema.cards)
    .set({ ...next, updatedAt: reviewedAt })
    .where(eq(schema.cards.id, cardId));
  await database.insert(schema.reviews).values({
    id: crypto.randomUUID(),
    cardId,
    grade: input.grade,
    reviewedAt,
    nextDueAt: next.dueAt,
    intervalDays: next.intervalDays,
    easeFactor: next.easeFactor,
  });

  return json({ success: true, card: { ...card[0], ...next, updatedAt: reviewedAt } });
}

export async function stats(database: Database) {
  const now = nowIso();
  const [cards, due, reviewsToday] = await Promise.all([
    database.select({ total: count() }).from(schema.cards),
    database
      .select({ total: count() })
      .from(schema.cards)
      .where(and(eq(schema.cards.suspended, false), lte(schema.cards.dueAt, now))),
    database
      .select({ total: count() })
      .from(schema.reviews)
      .where(sql`date(${schema.reviews.reviewedAt}) = date('now')`),
  ]);

  return json({
    totalCards: cards[0]?.total ?? 0,
    dueCards: due[0]?.total ?? 0,
    reviewsToday: reviewsToday[0]?.total ?? 0,
  });
}
