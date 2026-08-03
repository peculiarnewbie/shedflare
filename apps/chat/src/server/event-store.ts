import { type SyncEventPayloadMap, type SyncEventType, type SyncServerEvent } from "#/domain";
import { DataAccess as SyncDataAccess, SyncEventStore } from "@shedflare/sync-protocol";
import { Effect } from "effect";
import { ChatRepository } from "./chat-repository";
import type { DataAccess } from "./data-access";
import { EventProjector, type ProjectionInput } from "./event-projector";

type EventStoreInput = {
  sql: DataAccess;
  repository: ChatRepository;
  syncAccess: SyncDataAccess;
};

export class EventStore {
  private readonly sql: DataAccess;
  private readonly syncEventStore: SyncEventStore;
  private readonly projector: EventProjector;

  constructor({ sql, repository, syncAccess }: EventStoreInput) {
    this.sql = sql;
    this.projector = new EventProjector({ sql, repository });
    this.syncEventStore = new SyncEventStore(syncAccess, (eventType, payload) =>
      Effect.sync(() => this.projector.apply({ eventType, payload } as ProjectionInput)),
    );
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
    return this.syncEventStore
      .insertEvent(opId, eventType, payload)
      .pipe(Effect.map((event) => event as SyncServerEvent<T>));
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
