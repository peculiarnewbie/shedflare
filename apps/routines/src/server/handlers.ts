import { and, asc, eq, gte, lte } from "drizzle-orm";
import * as schema from "../db/schema";
import type { Database } from "./db";

const DEFAULT_SLEEP_TIME = "22:00";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

/** Sunday-anchored week bounds for a YYYY-MM-DD string, computed in UTC to
 * avoid server-timezone drift (the date string is already the user's local day). */
function weekBounds(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const startMs = Date.UTC(y, m - 1, d - dow);
  const fmt = (ms: number) => new Date(ms).toISOString().split("T")[0];
  return { start: fmt(startMs), end: fmt(startMs + 6 * 86_400_000) };
}

async function readSleepTime(database: Database): Promise<string> {
  const rows = await database
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "sleep_time"));
  return rows[0]?.value ?? DEFAULT_SLEEP_TIME;
}

export async function getDay(database: Database, dateParam: string | null) {
  const date = dateParam ?? todayStr();
  const { start, end } = weekBounds(date);

  const [routines, weekRows, sleepTime] = await Promise.all([
    database.select().from(schema.routines).orderBy(asc(schema.routines.sortOrder)),
    database
      .select()
      .from(schema.routineCompletions)
      .where(
        and(gte(schema.routineCompletions.date, start), lte(schema.routineCompletions.date, end)),
      ),
    readSleepTime(database),
  ]);

  // Day completions are derived from the week query; weekCounts power the
  // weekly-quota progress shown on weekly routine tiles.
  const completions = weekRows.filter((c) => c.date === date);
  const weekCounts: Record<string, number> = {};
  for (const c of weekRows) {
    if (c.completed) weekCounts[c.routineId] = (weekCounts[c.routineId] ?? 0) + 1;
  }

  return json({ date, routines, completions, weekCounts, sleepTime });
}

export async function listRoutines(database: Database) {
  const routines = await database
    .select()
    .from(schema.routines)
    .orderBy(asc(schema.routines.sortOrder));
  return json({ routines });
}

export async function createRoutine(database: Database, body: unknown) {
  const { name, durationMinutes, color, weeklyTarget } = (body ?? {}) as {
    name?: string;
    durationMinutes?: number;
    color?: string;
    weeklyTarget?: number;
  };

  if (!name?.trim() || !durationMinutes || durationMinutes <= 0) {
    return json({ error: "name and a positive durationMinutes are required" }, 400);
  }

  const existing = await database.select().from(schema.routines);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await database.insert(schema.routines).values({
    id,
    name: name.trim(),
    color: color || "#5b8def",
    durationMinutes,
    weeklyTarget: Math.max(0, Math.floor(weeklyTarget ?? 0)),
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now,
  });

  return json({ success: true, id });
}

export async function updateRoutine(database: Database, id: string, body: unknown) {
  const { name, durationMinutes, color, weeklyTarget } = (body ?? {}) as {
    name?: string;
    durationMinutes?: number;
    color?: string;
    weeklyTarget?: number;
  };

  if (!name?.trim() || !durationMinutes || durationMinutes <= 0) {
    return json({ error: "name and a positive durationMinutes are required" }, 400);
  }

  await database
    .update(schema.routines)
    .set({
      name: name.trim(),
      durationMinutes,
      ...(color ? { color } : {}),
      ...(weeklyTarget === undefined
        ? {}
        : { weeklyTarget: Math.max(0, Math.floor(weeklyTarget)) }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.routines.id, id));

  return json({ success: true });
}

export async function deleteRoutine(database: Database, id: string) {
  await database.delete(schema.routines).where(eq(schema.routines.id, id));
  return json({ success: true });
}

export async function toggleCompletion(database: Database, body: unknown) {
  const { routineId, date } = (body ?? {}) as { routineId?: string; date?: string };
  if (!routineId || !date) {
    return json({ error: "routineId and date are required" }, 400);
  }

  const existing = await database
    .select()
    .from(schema.routineCompletions)
    .where(
      and(
        eq(schema.routineCompletions.routineId, routineId),
        eq(schema.routineCompletions.date, date),
      ),
    );

  const now = new Date().toISOString();

  if (existing[0]) {
    await database
      .update(schema.routineCompletions)
      .set({ completed: !existing[0].completed, updatedAt: now })
      .where(eq(schema.routineCompletions.id, existing[0].id));
    return json({ success: true, completed: !existing[0].completed });
  }

  await database.insert(schema.routineCompletions).values({
    id: crypto.randomUUID(),
    routineId,
    date,
    completed: true,
    createdAt: now,
    updatedAt: now,
  });
  return json({ success: true, completed: true });
}

export async function reorderRoutines(database: Database, body: unknown) {
  const { ids } = (body ?? {}) as { ids?: string[] };
  if (!Array.isArray(ids)) {
    return json({ error: "ids array is required" }, 400);
  }

  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i++) {
    await database
      .update(schema.routines)
      .set({ sortOrder: i, updatedAt: now })
      .where(eq(schema.routines.id, ids[i]));
  }

  return json({ success: true });
}

/**
 * All completions in the inclusive [from, to] date range. The calendar (dots)
 * and the analytics page both build their views client-side from this, which
 * keeps period navigation and per-routine filtering on the client.
 */
export async function getCompletions(database: Database, from: string | null, to: string | null) {
  if (!from || !to) {
    return json({ error: "from and to query params are required" }, 400);
  }

  const completions = await database
    .select()
    .from(schema.routineCompletions)
    .where(and(gte(schema.routineCompletions.date, from), lte(schema.routineCompletions.date, to)));

  return json({ completions: completions.filter((c) => c.completed) });
}

export async function setSleepTime(database: Database, body: unknown) {
  const { sleepTime } = (body ?? {}) as { sleepTime?: string };
  if (!sleepTime || !/^\d{2}:\d{2}$/.test(sleepTime)) {
    return json({ error: "sleepTime must be in HH:MM format" }, 400);
  }

  const now = new Date().toISOString();
  const existing = await database
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "sleep_time"));

  if (existing[0]) {
    await database
      .update(schema.settings)
      .set({ value: sleepTime, updatedAt: now })
      .where(eq(schema.settings.key, "sleep_time"));
  } else {
    await database.insert(schema.settings).values({
      id: crypto.randomUUID(),
      key: "sleep_time",
      value: sleepTime,
      updatedAt: now,
    });
  }

  return json({ success: true, sleepTime });
}
