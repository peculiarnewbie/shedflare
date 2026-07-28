import * as D1Client from "@effect/sql-d1/D1Client";
import { makeWithDefaults } from "drizzle-orm/effect-d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
export type Db = DrizzleD1Database;

/**
 * Money's HTTP and command handlers are promise-based today. This facade keeps
 * that boundary while all actual database queries run through Drizzle's
 * Effect-native D1 driver.
 */
class EffectDatabase {
  private readonly runtime;
  private readonly nativeDb;

  constructor(d1: D1Database) {
    this.runtime = ManagedRuntime.make(D1Client.layer({ db: d1 }));
    this.nativeDb = this.runtime.runSync(makeWithDefaults({}));
  }

  runPromise<A, E>(effect: Effect.Effect<A, E, D1Client.D1Client>): Promise<A> {
    return this.runtime.runPromise(effect);
  }

  db(): Db {
    return promiseDb<Db>(this.nativeDb, this);
  }
}

const databases = new WeakMap<D1Database, EffectDatabase>();
const executionMethods = new Set(["all", "execute", "get", "run"]);

function promiseDb<T>(value: unknown, database: EffectDatabase): T {
  if (typeof value !== "object" || value === null) return value as T;

  return new Proxy(value, {
    get(target, property) {
      const member = Reflect.get(target, property, target);
      const execute = Reflect.get(target, "execute", target);
      if (property === "run" && typeof execute === "function") {
        return (...args: unknown[]) =>
          database.runPromise(
            Reflect.apply(
              execute as (
                ...arguments_: unknown[]
              ) => Effect.Effect<unknown, unknown, D1Client.D1Client>,
              target,
              args,
            ),
          );
      }
      if (typeof member !== "function") return promiseDb(member, database);

      return (...args: unknown[]) => {
        const result = Reflect.apply(member, target, args);
        if (
          typeof property === "string" &&
          executionMethods.has(property) &&
          Effect.isEffect(result)
        ) {
          return database.runPromise(result as Effect.Effect<unknown, unknown, D1Client.D1Client>);
        }
        return promiseDb(result, database);
      };
    },
  }) as T;
}

export function createDb(d1: D1Database) {
  let database = databases.get(d1);
  if (!database) {
    database = new EffectDatabase(d1);
    databases.set(d1, database);
  }
  return database.db();
}
