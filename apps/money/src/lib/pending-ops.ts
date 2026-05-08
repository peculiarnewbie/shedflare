/**
 * Pending operations tracker.
 * Manages optimistic operations that haven't been acknowledged by the server yet.
 * Persisted to localStorage for resilience across page reloads.
 */
import { createId, nowIso } from "../domain/types";
import type { SyncClientCommand } from "../domain/events";

const PENDING_OPS_KEY = "money.pendingOps";

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface TrackedOp {
  opId: string;
  clientTs: string;
  commandType: string;
  payload: unknown;
  resolve: () => void;
  reject: (reason: string) => void;
}

const ops = new Map<string, TrackedOp>(
  Object.entries(readJson<Record<string, any>>(PENDING_OPS_KEY, {})).map(([key, op]) => [
    key,
    { ...op, resolve: () => {}, reject: () => {} },
  ]),
);

function persist() {
  if (typeof localStorage === "undefined") return;
  const plain: Record<string, any> = {};
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
let sendFn: ((msg: object) => void) | null = null;

export function setSendFn(fn: (msg: object) => void) {
  sendFn = fn;
}

function sendOp(op: { opId: string; clientTs: string; commandType: string; payload: unknown }) {
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
 * Dispatch a command to the server.
 * Returns a promise that resolves on ack, rejects on reject.
 * Optimistic mutations should be applied before calling this.
 */
export function dispatch(
  commandType: string,
  payload: unknown,
  options?: { opId?: string },
): { opId: string; promise: Promise<void> } {
  const opId = options?.opId ?? createId("op");
  const op: TrackedOp = {
    opId,
    clientTs: nowIso(),
    commandType,
    payload,
    resolve: () => {},
    reject: () => {},
  };
  let resolve: () => void;
  let reject: (reason: string) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = (reason: string) => rej(new Error(reason));
  });
  ops.set(opId, { ...op, resolve: resolve!, reject: reject! });
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

/** Called by sync-adapter when server rejects an op. */
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

/** Get all unacked opIds for the hello handshake. */
export function unackedOpIds(): string[] {
  return [...ops.keys()];
}
