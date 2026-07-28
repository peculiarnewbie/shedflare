import { Data, Effect } from "effect";
import { describe, expect, it } from "vitest";
import { DataAccess } from "./data-access";
import { SyncDecodeError, SyncStorageError } from "./errors";
import { SyncEventStore } from "./event-store";
import { HandlerRegistry } from "./handler-registry";
import { SyncEngineDO, type HandlerContext } from "./durable-object";
import type { SyncSnapshot } from "./sync-types";

function rows(value: Record<string, unknown>[]) {
  return { toArray: () => value };
}

describe("Effect sync protocol core", () => {
  it("keeps SQL failures in the typed error channel", async () => {
    const cause = new Error("database unavailable");
    const access = new DataAccess(() => {
      throw cause;
    });

    const error = await Effect.runPromise(Effect.flip(access.getLastServerSeq()));

    expect(error).toBeInstanceOf(SyncStorageError);
    expect(error).toMatchObject({ operation: "queryOne", cause });
  });

  it("reports corrupt persisted events as decode failures", async () => {
    const access = new DataAccess(() =>
      rows([
        {
          seq: 1,
          event_id: "evt_1",
          op_id: null,
          type: "changed",
          payload_json: "{broken",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );

    const error = await Effect.runPromise(Effect.flip(access.getEventsAfter(0)));

    expect(error).toBeInstanceOf(SyncDecodeError);
    expect(error).toMatchObject({ target: "event" });
  });

  it("sequences journal persistence, projection, and server sequence", async () => {
    const operations: string[] = [];
    let sequence = 0;
    const access = new DataAccess((query) => {
      if (query.startsWith("INSERT INTO events")) {
        operations.push("journal");
        sequence += 1;
        return rows([]);
      }
      if (query.includes("MAX(seq)")) {
        operations.push("sequence");
        return rows([{ seq: sequence }]);
      }
      throw new Error(`Unexpected query: ${query}`);
    });
    const store = new SyncEventStore(access, () =>
      Effect.sync(() => {
        operations.push("projection");
      }),
    );

    const event = await Effect.runPromise(store.insertEvent("op_1", "changed", { id: "row_1" }));

    expect(operations).toEqual(["journal", "projection", "sequence"]);
    expect(event).toMatchObject({ serverSeq: 1, eventType: "changed", causedByOpId: "op_1" });
  });

  it("preserves handler failures without converting them to defects", async () => {
    class Rejected extends Data.TaggedError("Rejected")<{ readonly reason: string }> {}
    const registry = new HandlerRegistry<object>();
    registry.set("reject", () => Effect.fail(new Rejected({ reason: "invalid" })));

    const handler = registry.get("reject");
    expect(handler).toBeDefined();
    const error = await Effect.runPromise(Effect.flip(handler!("op_1", {}, {})));

    expect(error).toBeInstanceOf(Rejected);
    expect(error).toMatchObject({ reason: "invalid" });
  });

  it("drives deduplication, handler execution, and ack persistence as one transaction effect", async () => {
    let persistedAck: string | null = null;
    let handlerCalls = 0;
    let transactions = 0;
    const sql = {
      exec(query: string, ...params: unknown[]) {
        if (query.startsWith("SELECT * FROM commands")) {
          return rows(
            persistedAck
              ? [
                  {
                    op_id: "op_1",
                    type: "change",
                    response_json: persistedAck,
                    acked_seq: 7,
                    created_at: "2026-01-01T00:00:00.000Z",
                  },
                ]
              : [],
          );
        }
        if (query.includes("INSERT OR REPLACE INTO commands")) {
          persistedAck = String(params[3]);
          return rows([]);
        }
        throw new Error(`Unexpected query: ${query}`);
      },
    };
    const ctx = {
      storage: { sql },
      getWebSockets: () => [],
      waitUntil: () => undefined,
      acceptWebSocket: () => undefined,
    } as unknown as DurableObjectState;

    class TestEngine extends SyncEngineDO<object> {
      get protocolVersion() {
        return "test";
      }

      constructor() {
        super(ctx, {});
        this.registerHandlers(this.handlerRegistry);
      }

      registerHandlers(registry: HandlerRegistry<HandlerContext<object>>) {
        registry.set("change", () => {
          handlerCalls += 1;
          return Effect.succeed({
            events: [
              {
                type: "event",
                serverSeq: 7,
                eventId: "evt_1",
                eventType: "changed",
                payload: {},
              },
            ],
          });
        });
      }

      protected getSnapshotEffect() {
        return Effect.succeed({ tables: {} } satisfies SyncSnapshot);
      }

      protected executeTransaction<A, E>(effect: Effect.Effect<A, E, never>) {
        transactions += 1;
        return effect;
      }

      run() {
        return this.processCommandEffect("op_1", "change", {}, false);
      }
    }

    const engine = new TestEngine();
    const first = await Effect.runPromise(engine.run());
    const duplicate = await Effect.runPromise(engine.run());

    expect(first.ack).toMatchObject({ opId: "op_1", serverSeq: 7, commandType: "change" });
    expect(duplicate.ack).toEqual(first.ack);
    expect(handlerCalls).toBe(1);
    expect(transactions).toBe(1);
  });
});
