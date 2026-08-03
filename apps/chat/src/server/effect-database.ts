import * as SqliteClient from "@effect/sql-sqlite-do/SqliteClient";
import { makeWithDefaults, type EffectSQLiteDoDatabase } from "drizzle-orm/effect-sqlite-do";
import type * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";

export type ChatDrizzleDatabase = EffectSQLiteDoDatabase;

/**
 * Owns the scoped Effect SQL client for one Durable Object instance.
 *
 * The sync protocol still exposes synchronous callbacks, so `runSync` is the
 * deliberate compatibility edge. Database programs remain Effects everywhere
 * inside that edge and share one DO-lifetime client instead of rebuilding a
 * layer for every query.
 */
export class EffectDatabase {
  private readonly runtime;
  readonly drizzle: ChatDrizzleDatabase;

  constructor(readonly storage: DurableObjectStorage) {
    this.runtime = ManagedRuntime.make(SqliteClient.layer({ storage }));
    this.drizzle = this.runtime.runSync(makeWithDefaults({ storage }));
  }

  runSync<A, E>(effect: Effect.Effect<A, E, never>): A {
    return this.runtime.runSync(effect);
  }

  runPromise<A, E>(effect: Effect.Effect<A, E, never>): Promise<A> {
    return this.runtime.runPromise(effect);
  }
}
