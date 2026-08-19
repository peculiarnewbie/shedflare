import { Effect } from "effect";
import type { SyncServerEvent, SyncSnapshot } from "./sync-types";
import type { DataAccess } from "./data-access";
import { createId, json, nowIso } from "./sync-utils";

export type ProjectionFn = (
  eventType: string,
  payload: SyncServerEvent["payload"],
) => Effect.Effect<void, unknown, never>;

export class SyncEventStore {
  constructor(
    private readonly access: DataAccess,
    private readonly projection: ProjectionFn,
  ) {}

  insertEvent(opId: string | null, eventType: string, payload: SyncServerEvent["payload"]) {
    return Effect.gen({ self: this }, function* (this: SyncEventStore) {
      const eventId = createId("evt");
      const createdAt = nowIso();

      yield* this.access.exec(
        `INSERT INTO events (event_id, op_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        eventId,
        opId,
        eventType,
        json(payload),
        createdAt,
      );
      yield* this.projection(eventType, payload);
      const serverSeq = yield* this.access.getLastServerSeq();

      return {
        type: "event" as const,
        serverSeq,
        eventId,
        eventType,
        payload,
        causedByOpId: opId,
      } satisfies SyncServerEvent;
    });
  }

  persistCommandAck(
    opId: string,
    commandType: string,
    ackedSeq: number,
    ackJson: string,
    createdAt: string,
  ) {
    return this.access
      .exec(
        `INSERT OR REPLACE INTO commands (op_id, type, status, response_json, acked_seq, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
        opId,
        commandType,
        "accepted",
        ackJson,
        ackedSeq,
        createdAt,
      )
      .pipe(Effect.asVoid);
  }

  replaceSnapshot(snapshot: SyncSnapshot) {
    return Effect.forEach(
      Object.entries(snapshot.tables),
      ([tableName, rows]) =>
        this.access.exec(`DELETE FROM ${tableName}`).pipe(
          Effect.andThen(
            Effect.forEach(Object.values(rows), (row) => this.projection("snapshot_restore", row), {
              discard: true,
            }),
          ),
        ),
      { discard: true },
    );
  }
}
