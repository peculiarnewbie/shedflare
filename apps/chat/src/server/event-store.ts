import {
  createId,
  nowIso,
  type SyncEventPayloadMap,
  type SyncEventType,
  type SyncServerEvent,
} from "#/domain";
import { DataAccess as SyncDataAccess } from "@shedflare/sync-protocol";
import { Effect } from "effect";
import { ChatRepository } from "./chat-repository";
import type { DataAccess } from "./data-access";
import { EventProjector, type ProjectionInput } from "./event-projector";
import { json } from "./sync-utils";

type EventStoreInput = {
  sql: DataAccess;
  repository: ChatRepository;
  syncAccess: SyncDataAccess;
};

function projectionInput<T extends SyncEventType>(
  eventType: T,
  payload: SyncEventPayloadMap[T],
): ProjectionInput {
  // SAFETY: eventType and payload share T, so the mapped discriminated-union member is preserved.
  return { eventType, payload } as ProjectionInput;
}

export class EventStore {
  private readonly sql: DataAccess;
  private readonly projector: EventProjector;

  constructor({ sql, repository, syncAccess }: EventStoreInput) {
    this.sql = sql;
    this.projector = new EventProjector({ sql, repository });
    void syncAccess;
  }

  insertEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ): SyncServerEvent<T> {
    return this.sql.database.runSync(this.insertEventEffect(opId, eventType, payload));
  }

  insertEventEffect<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ) {
    return Effect.gen({ self: this }, function* (this: EventStore) {
      const eventId = createId("evt");
      const createdAt = nowIso();
      yield* Effect.sync(() =>
        this.sql.exec(
          `INSERT INTO events (event_id, op_id, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
          eventId,
          opId,
          eventType,
          json(payload),
          createdAt,
        ),
      );
      yield* Effect.sync(() => this.projector.apply(projectionInput(eventType, payload)));
      const serverSeq = yield* Effect.sync(() => this.sql.getLastServerSeq());
      return {
        type: "event" as const,
        serverSeq,
        eventId,
        eventType,
        payload,
        causedByOpId: opId,
      } satisfies SyncServerEvent<T>;
    });
  }

  async appendServerEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ): Promise<SyncServerEvent<T>> {
    return this.sql.database.runPromise(
      this.sql.db.transaction(() => this.insertEventEffect(opId, eventType, payload)),
    );
  }
}
