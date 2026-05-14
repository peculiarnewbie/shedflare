import type { SyncServerEvent, SyncSnapshot } from "./sync-types";
import type { DataAccess, SqlExecFn } from "./data-access";
import { createId, nowIso, json } from "./sync-utils";

export type ProjectionFn = (eventType: string, payload: unknown, exec: SqlExecFn) => void;
export type TableReaderFn = (tableName: string) => Record<string, unknown>;

/**
 * Shared event-journal infrastructure.
 *
 * Owns the `events` table insert (seq generation, eventId) and the `commands`
 * table (op_id dedup persistence). Delegates materialized-state projection
 * to the app-supplied `projectionFn`.
 */
export class SyncEventStore {
  constructor(
    private readonly access: DataAccess,
    private readonly projectionFn: ProjectionFn,
  ) {}

  /** Insert an event into the journal and apply its projection. */
  insertEvent(opId: string | null, eventType: string, payload: unknown): SyncServerEvent {
    const eventId = createId("evt");
    const createdAt = nowIso();
    const payloadJson = json(payload);

    this.access.exec(
      `INSERT INTO events (event_id, op_id, type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      eventId,
      opId,
      eventType,
      payloadJson,
      createdAt,
    );

    this.projectionFn(eventType, payload, this.access.exec);

    const seq = this.access.getLastServerSeq();

    return {
      type: "event",
      serverSeq: seq,
      eventId,
      eventType,
      payload,
      causedByOpId: opId,
    };
  }

  /** Persist a command ack for idempotent replay. */
  persistCommandAck(
    opId: string,
    commandType: string,
    ackedSeq: number,
    ackJson: string,
    createdAt: string,
  ): void {
    this.access.exec(
      `INSERT OR REPLACE INTO commands (op_id, type, status, response_json, acked_seq, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      opId,
      commandType,
      "accepted",
      ackJson,
      ackedSeq,
      createdAt,
    );
  }

  /** Replace all materialized tables with the contents of a snapshot. */
  replaceSnapshot(snapshot: SyncSnapshot): void {
    for (const [tableName, rows] of Object.entries(snapshot.tables)) {
      this.access.exec(`DELETE FROM ${tableName}`);
      for (const row of Object.values(rows)) {
        this.projectionFn("snapshot_restore", row, this.access.exec);
      }
    }
  }
}
