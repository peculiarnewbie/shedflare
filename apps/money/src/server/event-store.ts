/**
 * Event Store — persists events and applies them to materialized state.
 * Pattern: event sourcing with snapshot-based materialized views.
 */
import * as schema from "../db/schema";
import type { SyncServerEvent } from "../domain/events";
import type { SyncEventPayloadMap, SyncEventType } from "../domain/events";
import type { SyncSnapshot } from "../domain/types";
import type { DataAccess } from "./data-access";
import { Projection } from "./projection";
import { createId, nowIso } from "../domain/types";
import { startSpanWithStack, endSpanWithStack } from "./tracer";

export class EventStore {
  private readonly projection: Projection;

  constructor(private readonly access: DataAccess) {
    this.projection = new Projection(access);
  }

  insertEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ): SyncServerEvent<T> {
    const spanId = startSpanWithStack("EventStore.insertEvent", { eventType, opId });
    const eventId = createId("evt");
    const createdAt = nowIso();
    const row = this.access.db
      .insert(schema.events)
      .values({
        eventId,
        opId,
        type: eventType,
        payloadJson: JSON.stringify(payload),
        createdAt,
      })
      .returning({ seq: schema.events.seq })
      .get();
    const serverSeq = Number(row?.seq ?? 0);
    this.projection.apply(eventType, payload);
    endSpanWithStack(spanId, { serverSeq, eventType });
    return {
      type: "event",
      serverSeq,
      eventId,
      eventType,
      payload,
      causedByOpId: opId,
    } as SyncServerEvent<T>;
  }

  async appendEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ) {
    return this.access.db.transaction(() => this.insertEvent(opId, eventType, payload));
  }

  replaceSnapshot(snapshot: SyncSnapshot) {
    this.projection.replaceFromSnapshot(snapshot);
  }
}
