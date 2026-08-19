import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { applyDrizzleMigrations } from "@shedflare/test-utils/migrations";
import { asD1Database, createD1Shim } from "@shedflare/test-utils/d1-shim";
import * as schema from "../db/schema";
import { db } from "./db";
import { createRoutine, getDay, setSleepTime, toggleCompletion } from "./handlers";

function createDatabase() {
  const shim = createD1Shim();
  applyDrizzleMigrations(shim, join(import.meta.dirname, "../migrations"));
  return db(asD1Database(shim));
}

describe("Routines handlers", () => {
  test("creates and completes a routine in the requested week", async () => {
    const database = createDatabase();
    expect(
      (
        await createRoutine(database, {
          name: "Stretch",
          durationMinutes: 15,
          weeklyTarget: 3,
        })
      ).status,
    ).toBe(200);
    const [routine] = await database.select().from(schema.routines);
    if (!routine) throw new Error("Expected a routine to be created");

    const completion = await toggleCompletion(database, {
      routineId: routine.id,
      date: "2026-08-18",
    });
    expect(await completion.json()).toMatchObject({ success: true, completed: true });

    const day = await getDay(database, "2026-08-18");
    expect(await day.json()).toMatchObject({
      date: "2026-08-18",
      weekCounts: { [routine.id]: 1 },
      sleepTime: "22:00",
    });
  });

  test("persists the configured sleep time", async () => {
    const database = createDatabase();
    expect((await setSleepTime(database, { sleepTime: "23:15" })).status).toBe(200);
    const day = await getDay(database, "2026-08-18");
    expect(await day.json()).toMatchObject({ sleepTime: "23:15" });
  });
});
