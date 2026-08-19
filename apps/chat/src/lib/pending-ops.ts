import {
  createId,
  decodeCommandInvocation,
  isSyncCommandType,
  nowIso,
  type PendingSyncOp,
  type SyncClientCommand,
  type SyncCommandPayloadMap,
  type SyncCommandType,
} from "#/domain";
import * as Schema from "effect/Schema";

const PENDING_OPS_KEY = "shedflare.pendingOps";

type TrackedOp = PendingSyncOp & {
  resolve: () => void;
  reject: (reason: string) => void;
};

const StoredPendingOpsSchema = Schema.Record(
  Schema.String,
  Schema.Struct({
    opId: Schema.String,
    clientTs: Schema.String,
    commandType: Schema.String,
    payload: Schema.Any,
  }),
);

function readPendingOps() {
  const restored = new Map<string, TrackedOp>();
  if (!globalThis.localStorage) return restored;
  const raw = localStorage.getItem(PENDING_OPS_KEY);
  if (!raw) return restored;
  try {
    const stored = Schema.decodeUnknownSync(StoredPendingOpsSchema)(JSON.parse(raw));
    for (const [key, op] of Object.entries(stored)) {
      if (!isSyncCommandType(op.commandType)) continue;
      const invocation = decodeCommandInvocation(op.commandType, op.payload);
      restored.set(key, {
        opId: op.opId,
        clientTs: op.clientTs,
        ...invocation,
        resolve: () => {},
        reject: () => {},
      });
    }
  } catch {
    console.warn("[pending-ops] failed to parse persisted operations");
  }
  return restored;
}

const ops = readPendingOps();

function persist() {
  if (!globalThis.localStorage) return;
  const plain: Record<string, PendingSyncOp> = {};
  for (const [key, op] of ops) {
    plain[key] = {
      opId: op.opId,
      clientTs: op.clientTs,
      commandType: op.commandType,
      payload: op.payload,
    };
  }
  localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(plain));
}

/** Send function, set by ws-connection after init. */
type SyncCommandSender = (message: SyncClientCommand) => void;
let sendFn: SyncCommandSender | null = null;

export function setSendFn(fn: SyncCommandSender) {
  sendFn = fn;
}

function sendOp(op: PendingSyncOp) {
  if (!sendFn) return;
  sendFn({
    type: "command",
    opId: op.opId,
    clientTs: op.clientTs,
    commandType: op.commandType,
    payload: op.payload,
  } satisfies SyncClientCommand);
}

/**
 * Dispatch a command to the server. Returns a promise that resolves on ack,
 * rejects on reject. The optimistic mutations should be applied before calling this.
 */
export function dispatch<T extends SyncCommandType>(
  commandType: T,
  payload: SyncCommandPayloadMap[T],
  options?: { opId?: string },
) {
  const opId = options?.opId ?? createId("op");
  const op: PendingSyncOp = {
    opId,
    clientTs: nowIso(),
    commandType,
    payload,
  };
  let resolve = () => {};
  let reject = (_reason: string) => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = (reason: string) => rej(new Error(reason));
  });
  ops.set(opId, { ...op, resolve, reject });
  persist();
  sendOp(op);
  return { opId, promise };
}

/** Called by sync-adapter when server acknowledges an op. */
export function resolve(opId: string) {
  const op = ops.get(opId);
  if (!op) return;
  op.resolve();
  ops.delete(opId);
  persist();
}

/** Called by sync-adapter when server rejects an op. Returns the opId for rollback. */
export function reject(opId: string, reason: string) {
  const op = ops.get(opId);
  if (!op) return;
  op.reject(reason);
  ops.delete(opId);
  persist();
}

/** Re-send all pending ops after reconnect handshake. */
export function flushAll() {
  for (const op of ops.values()) {
    sendOp(op);
  }
}

/** Clear all pending ops (on non-initial sync_reset). */
export function clear() {
  for (const op of ops.values()) {
    op.reject("sync_reset");
  }
  ops.clear();
  persist();
}

/** Test helper: drop pending ops without rejecting in-flight promises. */
export function resetPendingOps() {
  ops.clear();
  persist();
}

/** Get all unacked opIds for the hello handshake. */
export function unackedOpIds(): string[] {
  return [...ops.keys()];
}
