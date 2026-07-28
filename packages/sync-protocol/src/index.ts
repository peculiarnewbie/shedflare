export { DataAccess } from "./data-access";
export type { SqlExecFn, SqlResult } from "./data-access";
export { SyncEventStore } from "./event-store";
export type { ProjectionFn } from "./event-store";
export { HandlerRegistry } from "./handler-registry";
export type { CommandHandlerResult, CommandHandlerFn } from "./handler-registry";
export { SyncEngineDO } from "./durable-object";
export type { HandlerContext } from "./durable-object";
export {
  SyncStorageError,
  SyncDecodeError,
  UnknownSyncCommandError,
  SyncCommandExecutionError,
  type SyncProtocolError,
} from "./errors";

export type {
  SyncClientEnvelope,
  SyncClientHello,
  SyncClientCommand,
  SyncClientResume,
  SyncServerEnvelope,
  SyncServerHelloAck,
  SyncServerAck,
  SyncServerReject,
  SyncServerEvent,
  SyncServerReset,
  SyncSnapshot,
} from "./sync-types";

export { json, parseJson, nowIso, isWebSocketRequest, createId } from "./sync-utils";
export { EVENTS_TABLE_DDL, COMMANDS_TABLE_DDL } from "./schema";
