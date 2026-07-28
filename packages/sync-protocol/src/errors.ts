import { Data } from "effect";

export class SyncStorageError extends Data.TaggedError("SyncStorageError")<{
  readonly operation: "exec" | "queryOne" | "queryAll" | "transaction";
  readonly query?: string;
  readonly cause: unknown;
}> {}

export class SyncDecodeError extends Data.TaggedError("SyncDecodeError")<{
  readonly target: "event" | "commandAck" | "clientEnvelope" | "internalCommand";
  readonly cause: unknown;
}> {}

export class UnknownSyncCommandError extends Data.TaggedError("UnknownSyncCommandError")<{
  readonly commandType: string;
}> {}

export class SyncCommandExecutionError extends Data.TaggedError("SyncCommandExecutionError")<{
  readonly opId: string;
  readonly commandType: string;
  readonly phase: "decode" | "handler";
  readonly cause: unknown;
}> {}

export type SyncProtocolError =
  | SyncStorageError
  | SyncDecodeError
  | UnknownSyncCommandError
  | SyncCommandExecutionError;
