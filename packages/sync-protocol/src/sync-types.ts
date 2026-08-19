import * as Schema from "effect/Schema";

// ─── Client → Server ─────────────────────────────────────────────

export const SyncClientHelloSchema = Schema.Struct({
  type: Schema.Literal("hello"),
  clientId: Schema.String,
  protocolVersion: Schema.String,
  lastServerSeq: Schema.Number,
  unackedOpIds: Schema.Array(Schema.String),
});
export type SyncClientHello = typeof SyncClientHelloSchema.Type;

export const SyncClientCommandSchema = Schema.Struct({
  type: Schema.Literal("command"),
  opId: Schema.String,
  clientTs: Schema.String,
  commandType: Schema.String,
  payload: Schema.Unknown,
});
export type SyncClientCommand = typeof SyncClientCommandSchema.Type;

export const SyncClientResumeSchema = Schema.Struct({
  type: Schema.Literal("resume"),
  lastServerSeq: Schema.Number,
});
export type SyncClientResume = typeof SyncClientResumeSchema.Type;

export const SyncClientEnvelopeSchema = Schema.Union([
  SyncClientHelloSchema,
  SyncClientCommandSchema,
  SyncClientResumeSchema,
]);
export type SyncClientEnvelope = typeof SyncClientEnvelopeSchema.Type;

// ─── Server → Client ─────────────────────────────────────────────

export interface SyncServerHelloAck {
  type: "hello_ack";
  protocolVersion: string;
  serverTime: string;
  lastServerSeq: number;
}

export interface SyncServerAck {
  type: "ack";
  opId: string;
  serverSeq: number;
  acceptedAt: string;
  commandType: string;
}

export const SyncServerAckSchema = Schema.Struct({
  type: Schema.Literal("ack"),
  opId: Schema.String,
  serverSeq: Schema.Number,
  acceptedAt: Schema.String,
  commandType: Schema.String,
});

export interface SyncServerReject {
  type: "reject";
  opId: string;
  reason: string;
  code: string;
  retriable: boolean;
}

export interface SyncServerEvent<T = unknown> {
  type: "event";
  serverSeq: number;
  eventId: string;
  eventType: string;
  payload: T;
  causedByOpId?: string | null;
}

export interface SyncServerReset {
  type: "sync_reset";
  reason: string;
  protocolVersion?: string;
  snapshot: SyncSnapshot;
}

export type SyncServerEnvelope =
  | SyncServerHelloAck
  | SyncServerAck
  | SyncServerReject
  | SyncServerEvent
  | SyncServerReset;

// ─── Snapshot ─────────────────────────────────────────────────────

export type SyncSnapshot = {
  serverSeq?: number;
  tables: Record<string, SyncTableRow>;
};

export type SyncTableRow = Record<string, SyncServerEvent["payload"]>;

// ─── Event payload map helper ─────────────────────────────────────

export type SyncEventPayloadMap = Record<string, SyncServerEvent["payload"]>;
