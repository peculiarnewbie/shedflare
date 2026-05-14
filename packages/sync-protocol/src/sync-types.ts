// ─── Client → Server ─────────────────────────────────────────────

export interface SyncClientHello {
  type: "hello";
  clientId: string;
  protocolVersion: string;
  lastServerSeq: number;
  unackedOpIds: string[];
}

export interface SyncClientCommand {
  type: "command";
  opId: string;
  clientTs: string;
  commandType: string;
  payload: unknown;
}

export interface SyncClientResume {
  type: "resume";
  lastServerSeq: number;
}

export interface SyncClientPing {
  type: "ping";
}

export type SyncClientEnvelope =
  | SyncClientHello
  | SyncClientCommand
  | SyncClientResume
  | SyncClientPing;

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

export interface SyncServerPong {
  type: "pong";
  at: string;
}

export type SyncServerEnvelope =
  | SyncServerHelloAck
  | SyncServerAck
  | SyncServerReject
  | SyncServerEvent
  | SyncServerReset
  | SyncServerPong;

// ─── Snapshot ─────────────────────────────────────────────────────

export type SyncSnapshot = {
  serverSeq?: number;
  tables: Record<string, Record<string, unknown>>;
};

// ─── Event payload map helper ─────────────────────────────────────

export type SyncEventPayloadMap = Record<string, unknown>;
