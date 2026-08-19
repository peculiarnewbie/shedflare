import { Effect } from "effect";
import * as Schema from "effect/Schema";
import { SyncServerAckSchema, type SyncServerAck, type SyncServerEvent } from "./sync-types";
import { SyncDecodeError, SyncStorageError } from "./errors";

export type SqlValue = string | number | bigint | boolean | null | ArrayBuffer | Uint8Array;
export type SqlRow = Record<string, SqlValue>;
export type SqlResult = { toArray(): SqlRow[] };
export type SqlExecFn = (query: string, ...params: unknown[]) => SqlResult;

export class DataAccess {
  constructor(private readonly execute: SqlExecFn) {}

  exec(query: string, ...params: unknown[]) {
    return Effect.try({
      try: () => this.execute(query, ...params),
      catch: (cause) => new SyncStorageError({ operation: "exec", query, cause }),
    });
  }

  queryOne<T extends SqlRow>(query: string, ...params: unknown[]) {
    return Effect.try({
      // SAFETY: callers supply T for the columns selected by this SQL statement.
      try: () => (this.execute(query, ...params).toArray() as T[])[0] ?? null,
      catch: (cause) => new SyncStorageError({ operation: "queryOne", query, cause }),
    });
  }

  queryAll<T extends SqlRow>(query: string, ...params: unknown[]) {
    return Effect.try({
      // SAFETY: callers supply T for the columns selected by this SQL statement.
      try: () => this.execute(query, ...params).toArray() as T[],
      catch: (cause) => new SyncStorageError({ operation: "queryAll", query, cause }),
    });
  }

  getLastServerSeq() {
    return this.queryOne<{ seq: number }>("SELECT COALESCE(MAX(seq), 0) AS seq FROM events").pipe(
      Effect.map((row) => row?.seq ?? 0),
    );
  }

  getOldestEventSeq() {
    return this.queryOne<{ seq: number }>("SELECT COALESCE(MIN(seq), 0) AS seq FROM events").pipe(
      Effect.map((row) => row?.seq ?? 0),
    );
  }

  getEventsAfter(afterSeq: number) {
    return this.queryAll<{
      seq: number;
      event_id: string;
      op_id: string | null;
      type: string;
      payload_json: string;
      created_at: string;
    }>("SELECT * FROM events WHERE seq > ? ORDER BY seq ASC", afterSeq).pipe(
      Effect.flatMap((rows) =>
        Effect.forEach(rows, (row) =>
          Effect.try({
            try: (): SyncServerEvent => ({
              type: "event",
              serverSeq: row.seq,
              eventId: row.event_id,
              eventType: row.type,
              payload: JSON.parse(row.payload_json),
              causedByOpId: row.op_id,
            }),
            catch: (cause) => new SyncDecodeError({ target: "event", cause }),
          }),
        ),
      ),
    );
  }

  getCommandAck(opId: string) {
    return this.queryOne<{
      op_id: string;
      type: string;
      response_json: string | null;
      acked_seq: number | null;
      created_at: string;
    }>("SELECT * FROM commands WHERE op_id = ?", opId).pipe(
      Effect.flatMap((row) => {
        if (!row?.response_json) return Effect.succeed<SyncServerAck | null>(null);
        const responseJson = row.response_json;
        return Effect.try({
          try: () => Schema.decodeUnknownSync(SyncServerAckSchema)(JSON.parse(responseJson)),
          catch: (cause) => new SyncDecodeError({ target: "commandAck", cause }),
        });
      }),
    );
  }

  tableRowCount(tableName: string) {
    return this.queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM ${tableName}`).pipe(
      Effect.map((row) => row?.count ?? 0),
    );
  }
}
