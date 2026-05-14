import type { SyncServerEvent, SyncServerAck } from "./sync-types";

export type SqlExecFn = (
  query: string,
  ...params: unknown[]
) => { toArray(): Record<string, unknown>[] };
export type SqlQueryOneFn = <T extends Record<string, unknown>>(
  query: string,
  ...params: unknown[]
) => T | null;
export type SqlQueryAllFn = <T extends Record<string, unknown>>(
  query: string,
  ...params: unknown[]
) => T[];

export class DataAccess {
  constructor(
    public readonly exec: SqlExecFn,
    public readonly queryOne: SqlQueryOneFn,
    public readonly queryAll: SqlQueryAllFn,
  ) {}

  getLastServerSeq(): number {
    const row = this.queryOne<{ seq: number }>("SELECT COALESCE(MAX(seq), 0) AS seq FROM events");
    return row?.seq ?? 0;
  }

  getOldestEventSeq(): number {
    const row = this.queryOne<{ seq: number }>("SELECT COALESCE(MIN(seq), 0) AS seq FROM events");
    return row?.seq ?? 0;
  }

  getEventsAfter(afterSeq: number): SyncServerEvent[] {
    const rows = this.queryAll<{
      seq: number;
      event_id: string;
      op_id: string | null;
      type: string;
      payload_json: string;
      created_at: string;
    }>("SELECT * FROM events WHERE seq > ? ORDER BY seq ASC", afterSeq);

    return rows.map((row) => ({
      type: "event" as const,
      serverSeq: row.seq,
      eventId: row.event_id,
      eventType: row.type,
      payload: JSON.parse(row.payload_json),
      causedByOpId: row.op_id,
    }));
  }

  getCommandAck(opId: string): SyncServerAck | null {
    const row = this.queryOne<{
      op_id: string;
      type: string;
      response_json: string | null;
      acked_seq: number | null;
      created_at: string;
    }>("SELECT * FROM commands WHERE op_id = ?", opId);

    if (!row || !row.response_json) return null;

    const parsed = JSON.parse(row.response_json) as SyncServerAck;
    return parsed;
  }

  /** Number of rows in a given data table (for diagnostics). */
  tableRowCount(tableName: string): number {
    const row = this.queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tableName}`);
    return row?.count ?? 0;
  }
}
