import * as dbSchema from "#/db/schema";
import type { ModelMessage, RunError } from "@tanstack/ai";
import {
  defineAIPersistence,
  defineInterruptStore,
  defineMessageStore,
  defineMetadataStore,
  defineRunStore,
  type ChatPersistence,
  type InterruptRecord,
  type RunRecord,
} from "@tanstack/ai-persistence";
import { and, asc, desc, eq, isNotNull, lte } from "drizzle-orm";
import { Option } from "effect";
import * as Schema from "effect/Schema";
import type { EffectDatabase } from "./effect-database";

function mapRun(row: typeof dbSchema.aiRuns.$inferSelect): RunRecord {
  const run: RunRecord = {
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    startedAt: row.startedAt,
  };
  if (row.finishedAt != null) run.finishedAt = row.finishedAt;
  if (row.error != null) {
    run.error = { message: row.error };
    if (row.errorCode != null) run.error.code = row.errorCode;
  }
  if (row.usageJson != null) run.usage = row.usageJson;
  if (row.sandboxKey != null) run.sandboxKey = row.sandboxKey;
  if (row.detachedSince != null) run.detachedSince = row.detachedSince;
  if (row.cancelRequested != null) run.cancelRequested = row.cancelRequested;
  if (row.driverEpoch != null) run.driverEpoch = row.driverEpoch;
  return run;
}

function mapInterrupt(row: typeof dbSchema.aiInterrupts.$inferSelect): InterruptRecord {
  const interrupt: InterruptRecord = {
    interruptId: row.interruptId,
    runId: row.runId,
    threadId: row.threadId,
    status: row.status,
    requestedAt: row.requestedAt,
    payload: row.payloadJson,
  };
  if (row.resolvedAt != null) interrupt.resolvedAt = row.resolvedAt;
  if (row.responseJson != null) interrupt.response = row.responseJson;
  return interrupt;
}

function reviveMessageDates(messages: readonly ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    const decoded = Schema.decodeUnknownOption(Schema.DateFromString)(message.createdAt);
    return Option.match(decoded, {
      onNone: () => message,
      onSome: (createdAt) =>
        Number.isNaN(createdAt.getTime()) ? message : { ...message, createdAt },
    });
  });
}

/** Build the official TanStack persistence stores over this Durable Object's SQLite DB. */
export function createChatPersistence(database: EffectDatabase) {
  const db = database.drizzle;

  const messages = defineMessageStore({
    async loadThread(threadId) {
      const row = await database.runPromise(
        db
          .select({ messagesJson: dbSchema.aiThreads.messagesJson })
          .from(dbSchema.aiThreads)
          .where(eq(dbSchema.aiThreads.threadId, threadId))
          .get(),
      );
      return reviveMessageDates(row?.messagesJson ?? []);
    },
    async saveThread(threadId, nextMessages) {
      const messagesJson = [...nextMessages];
      const updatedAt = Date.now();
      await database.runPromise(
        db
          .insert(dbSchema.aiThreads)
          .values({ threadId, messagesJson, updatedAt })
          .onConflictDoUpdate({
            target: dbSchema.aiThreads.threadId,
            set: { messagesJson, updatedAt },
          }),
      );
    },
  });

  const runs = defineRunStore({
    async get(runId) {
      const row = await database.runPromise(
        db.select().from(dbSchema.aiRuns).where(eq(dbSchema.aiRuns.runId, runId)).get(),
      );
      return row ? mapRun(row) : null;
    },
    async createOrResume({ runId, threadId, startedAt, status }) {
      const existing = await this.get(runId);
      if (existing) return existing;

      await database.runPromise(
        db
          .insert(dbSchema.aiRuns)
          .values({ runId, threadId, startedAt, status: status ?? "running" })
          .onConflictDoNothing({ target: dbSchema.aiRuns.runId }),
      );
      return (
        (await this.get(runId)) ?? {
          runId,
          threadId,
          startedAt,
          status: status ?? "running",
        }
      );
    },
    async update(runId, patch) {
      const set: Partial<typeof dbSchema.aiRuns.$inferInsert> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.finishedAt !== undefined) set.finishedAt = patch.finishedAt;
      if (patch.error !== undefined) {
        const error: RunError = patch.error;
        set.error = error.message;
        set.errorCode = error.code ?? null;
      }
      if (patch.usage !== undefined) set.usageJson = patch.usage;
      if ("sandboxKey" in patch) set.sandboxKey = patch.sandboxKey ?? null;
      if ("detachedSince" in patch) set.detachedSince = patch.detachedSince ?? null;
      if ("cancelRequested" in patch) set.cancelRequested = patch.cancelRequested ?? null;
      if ("driverEpoch" in patch) set.driverEpoch = patch.driverEpoch ?? null;
      if (Object.keys(set).length === 0) return;
      await database.runPromise(
        db.update(dbSchema.aiRuns).set(set).where(eq(dbSchema.aiRuns.runId, runId)),
      );
    },
    async findActiveRun(threadId) {
      const row = await database.runPromise(
        db
          .select()
          .from(dbSchema.aiRuns)
          .where(and(eq(dbSchema.aiRuns.threadId, threadId), eq(dbSchema.aiRuns.status, "running")))
          .orderBy(desc(dbSchema.aiRuns.startedAt))
          .get(),
      );
      return row ? mapRun(row) : null;
    },
    async listByThread(threadId) {
      const rows = await database.runPromise(
        db
          .select()
          .from(dbSchema.aiRuns)
          .where(eq(dbSchema.aiRuns.threadId, threadId))
          .orderBy(asc(dbSchema.aiRuns.startedAt)),
      );
      return rows.map(mapRun);
    },
    async listReclaimable({ now, ttlMs }) {
      const rows = await database.runPromise(
        db
          .select()
          .from(dbSchema.aiRuns)
          .where(
            and(
              eq(dbSchema.aiRuns.status, "running"),
              isNotNull(dbSchema.aiRuns.detachedSince),
              lte(dbSchema.aiRuns.detachedSince, now - ttlMs),
            ),
          ),
      );
      return rows.map(mapRun);
    },
  });

  const interrupts = defineInterruptStore({
    async create(record) {
      const values: typeof dbSchema.aiInterrupts.$inferInsert = {
        interruptId: record.interruptId,
        runId: record.runId,
        threadId: record.threadId,
        status: "pending",
        requestedAt: record.requestedAt,
        payloadJson: record.payload,
      };
      if (record.response !== undefined) values.responseJson = record.response;
      await database.runPromise(
        db
          .insert(dbSchema.aiInterrupts)
          .values(values)
          .onConflictDoNothing({ target: dbSchema.aiInterrupts.interruptId }),
      );
    },
    async resolve(interruptId, response) {
      const set: Partial<typeof dbSchema.aiInterrupts.$inferInsert> = {
        status: "resolved",
        resolvedAt: Date.now(),
      };
      if (response !== undefined) set.responseJson = response;
      await database.runPromise(
        db
          .update(dbSchema.aiInterrupts)
          .set(set)
          .where(eq(dbSchema.aiInterrupts.interruptId, interruptId)),
      );
    },
    async cancel(interruptId) {
      await database.runPromise(
        db
          .update(dbSchema.aiInterrupts)
          .set({ status: "cancelled", resolvedAt: Date.now() })
          .where(eq(dbSchema.aiInterrupts.interruptId, interruptId)),
      );
    },
    async get(interruptId) {
      const row = await database.runPromise(
        db
          .select()
          .from(dbSchema.aiInterrupts)
          .where(eq(dbSchema.aiInterrupts.interruptId, interruptId))
          .get(),
      );
      return row ? mapInterrupt(row) : null;
    },
    async list(threadId) {
      const rows = await database.runPromise(
        db
          .select()
          .from(dbSchema.aiInterrupts)
          .where(eq(dbSchema.aiInterrupts.threadId, threadId))
          .orderBy(asc(dbSchema.aiInterrupts.requestedAt)),
      );
      return rows.map(mapInterrupt);
    },
    async listPending(threadId) {
      const rows = await database.runPromise(
        db
          .select()
          .from(dbSchema.aiInterrupts)
          .where(
            and(
              eq(dbSchema.aiInterrupts.threadId, threadId),
              eq(dbSchema.aiInterrupts.status, "pending"),
            ),
          )
          .orderBy(asc(dbSchema.aiInterrupts.requestedAt)),
      );
      return rows.map(mapInterrupt);
    },
    async listByRun(runId) {
      const rows = await database.runPromise(
        db
          .select()
          .from(dbSchema.aiInterrupts)
          .where(eq(dbSchema.aiInterrupts.runId, runId))
          .orderBy(asc(dbSchema.aiInterrupts.requestedAt)),
      );
      return rows.map(mapInterrupt);
    },
    async listPendingByRun(runId) {
      const rows = await database.runPromise(
        db
          .select()
          .from(dbSchema.aiInterrupts)
          .where(
            and(
              eq(dbSchema.aiInterrupts.runId, runId),
              eq(dbSchema.aiInterrupts.status, "pending"),
            ),
          )
          .orderBy(asc(dbSchema.aiInterrupts.requestedAt)),
      );
      return rows.map(mapInterrupt);
    },
  });

  const metadata = defineMetadataStore({
    async get(namespace, key) {
      const row = await database.runPromise(
        db
          .select({ valueJson: dbSchema.aiMetadata.valueJson })
          .from(dbSchema.aiMetadata)
          .where(
            and(eq(dbSchema.aiMetadata.namespace, namespace), eq(dbSchema.aiMetadata.key, key)),
          )
          .get(),
      );
      return row?.valueJson ?? null;
    },
    async set(namespace, key, value) {
      if (value == null) {
        throw new TypeError(
          `Cannot store ${value} for (${namespace}, ${key}); use delete() to clear metadata.`,
        );
      }
      await database.runPromise(
        db
          .insert(dbSchema.aiMetadata)
          .values({ namespace, key, valueJson: value })
          .onConflictDoUpdate({
            target: [dbSchema.aiMetadata.namespace, dbSchema.aiMetadata.key],
            set: { valueJson: value },
          }),
      );
    },
    async delete(namespace, key) {
      await database.runPromise(
        db
          .delete(dbSchema.aiMetadata)
          .where(
            and(eq(dbSchema.aiMetadata.namespace, namespace), eq(dbSchema.aiMetadata.key, key)),
          ),
      );
    },
  });

  const persistence = defineAIPersistence({ stores: { messages, runs, interrupts, metadata } });
  return persistence satisfies ChatPersistence;
}

export function deletePersistedChatThread(database: EffectDatabase, threadId: string): void {
  const db = database.drizzle;
  database.runSync(
    db.delete(dbSchema.aiInterrupts).where(eq(dbSchema.aiInterrupts.threadId, threadId)),
  );
  database.runSync(db.delete(dbSchema.aiRuns).where(eq(dbSchema.aiRuns.threadId, threadId)));
  database.runSync(db.delete(dbSchema.aiThreads).where(eq(dbSchema.aiThreads.threadId, threadId)));
}
