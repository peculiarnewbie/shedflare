import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { applyDrizzleMigrations } from "@shedflare/test-utils/migrations";
import { createD1Shim, type D1Shim } from "@shedflare/test-utils/d1-shim";
import * as schema from "../db/schema";
import { db } from "./db";
import { createCard, createDeck, reviewCard, stats } from "./handlers";

function createDatabase() {
  const shim = createD1Shim();
  applyDrizzleMigrations(shim, join(import.meta.dirname, "../../drizzle/migrations"));
  // SAFETY: The published shim implements the D1 methods Drizzle exercises in these tests.
  return db(shim as D1Shim & D1Database);
}

describe("Anki handlers", () => {
  test("creates a deck, schedules a reviewed card, and updates stats", async () => {
    const database = createDatabase();
    expect((await createDeck(database, { name: "Languages" })).status).toBe(200);
    const [deck] = await database.select().from(schema.decks);
    expect(deck?.name).toBe("Languages");

    expect(
      (
        await createCard(database, {
          deckId: deck?.id,
          front: "selamat pagi",
          back: "good morning",
          tags: "Indonesian vocabulary",
        })
      ).status,
    ).toBe(200);
    const [card] = await database.select().from(schema.cards);
    if (!card) throw new Error("Expected a card to be created");

    expect((await reviewCard(database, { cardId: card.id, grade: "good" })).status).toBe(200);
    const [reviewed] = await database.select().from(schema.cards);
    expect(reviewed).toMatchObject({ repetitions: 1, intervalDays: 1, lapses: 0 });

    const response = await stats(database);
    expect(await response.json()).toEqual({ totalCards: 1, dueCards: 0, reviewsToday: 1 });
  });

  test("rejects cards whose deck does not exist", async () => {
    const response = await createCard(createDatabase(), {
      deckId: "missing",
      front: "front",
      back: "back",
    });
    expect(response.status).toBe(404);
  });
});
