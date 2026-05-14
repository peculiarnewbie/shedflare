import type { SyncServerEvent } from "../domain/events";
import type { SyncEventPayloadMap, SyncEventType } from "../domain/events";
import type { SyncSnapshot } from "../domain/types";
import type { DataAccess } from "./data-access";
import { Projection } from "./projection";
import { SyncEventStore } from "@shedflare/sync-protocol";

export class EventStore {
  private readonly syncEventStore: SyncEventStore;
  private readonly projection: Projection;

  constructor(private readonly access: DataAccess) {
    this.projection = new Projection(access);
    this.syncEventStore = new SyncEventStore(access.syncAccess, (eventType, payload) => {
      this.projection.apply(eventType, payload);
    });
  }

  insertEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ): SyncServerEvent<T> {
    const event = this.syncEventStore.insertEvent(opId, eventType, payload);
    return event as SyncServerEvent<T>;
  }

  async appendEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ): Promise<SyncServerEvent<T>> {
    return this.access.db.transaction(() => this.insertEvent(opId, eventType, payload)) as any;
  }

  replaceSnapshot(snapshot: SyncSnapshot) {
    this.projection.replaceFromSnapshot(snapshot);
  }
}
