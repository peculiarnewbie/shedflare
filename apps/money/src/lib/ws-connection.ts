/**
 * WebSocket connection manager for the money sync protocol.
 * Manages lifecycle, reconnection, envelope batching, and cursor persistence.
 */
import { createSignal } from "solid-js";
import { SYNC_PROTOCOL_VERSION, createId } from "../domain/types";
import type { SyncServerEnvelope, SyncClientEnvelope, SyncClientCommand } from "../domain/events";
import * as pendingOps from "./pending-ops";

// ---------------------------------------------------------------------------
// Persistent client identity & sync cursor
// ---------------------------------------------------------------------------

const CLIENT_ID_KEY = "money.clientId";
const LAST_SERVER_SEQ_KEY = "money.lastServerSeq";

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

const clientId = readJson(CLIENT_ID_KEY, createId("client"));
if (typeof localStorage !== "undefined") {
  localStorage.setItem(CLIENT_ID_KEY, JSON.stringify(clientId));
}

let lastServerSeq = readJson<number>(LAST_SERVER_SEQ_KEY, 0);

export function getLastServerSeq() {
  return lastServerSeq;
}

export function setLastServerSeq(seq: number) {
  lastServerSeq = seq;
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LAST_SERVER_SEQ_KEY, JSON.stringify(seq));
  }
}

// ---------------------------------------------------------------------------
// Envelope callback
// ---------------------------------------------------------------------------

let onEnvelopes: ((envelopes: SyncServerEnvelope[]) => void) | null = null;

export function setOnEnvelopes(fn: (envelopes: SyncServerEnvelope[]) => void) {
  onEnvelopes = fn;
}

// ---------------------------------------------------------------------------
// Envelope batching (RAF)
// ---------------------------------------------------------------------------

let incomingQueue: SyncServerEnvelope[] = [];
let flushScheduled = false;

function enqueueEnvelope(envelope: SyncServerEnvelope) {
  incomingQueue.push(envelope);
  if (flushScheduled) return;
  flushScheduled = true;

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(flush);
    return;
  }
  queueMicrotask(flush);
}

function flush() {
  flushScheduled = false;
  if (incomingQueue.length === 0) return;
  const batch = incomingQueue.splice(0);
  onEnvelopes?.(batch);
  if (incomingQueue.length > 0 && !flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}

// ---------------------------------------------------------------------------
// WebSocket lifecycle
// ---------------------------------------------------------------------------

let socket: WebSocket | undefined;
let reconnectCount = 0;
let reconnectTimer: number | undefined;
let started = false;

const [isConnected, setIsConnected] = createSignal(false);
export { isConnected };

const [reconnectAttempt, setReconnectAttempt] = createSignal(0);
const [reconnectDelay, setReconnectDelay] = createSignal(0);
export { reconnectAttempt, reconnectDelay };

function log(message: string, details?: Record<string, unknown>) {
  const entry = JSON.stringify({ scope: "money-ws", event: message, ...details });
  console.log(entry);
}

function send(message: object) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function connect() {
  if (typeof window === "undefined") return;
  try {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    log("connect", { clientId, lastServerSeq });
    const ws = new WebSocket(`${protocol}//${location.host}/api/sync/ws`);
    socket = ws;

    ws.addEventListener("open", () => {
      reconnectCount = 0;
      setReconnectAttempt(0);
      setReconnectDelay(0);
      setIsConnected(true);
      log("open", { pendingOps: pendingOps.unackedOpIds().length });
      send({
        type: "hello",
        clientId,
        protocolVersion: SYNC_PROTOCOL_VERSION,
        lastServerSeq,
        unackedOpIds: pendingOps.unackedOpIds(),
      } satisfies SyncClientEnvelope);
    });

    ws.addEventListener("message", ({ data }) => {
      try {
        const envelope = JSON.parse(String(data)) as SyncServerEnvelope;
        enqueueEnvelope(envelope);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.addEventListener("close", () => {
      log("close");
      setIsConnected(false);
      scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      log("error");
      setIsConnected(false);
    });
  } catch (err) {
    log("connect_error", { error: err instanceof Error ? err.message : String(err) });
    setIsConnected(false);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (typeof window === "undefined") return;
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  reconnectCount++;
  setReconnectAttempt(reconnectCount);
  const delay = Math.min(10_000, 500 * 2 ** reconnectCount);
  setReconnectDelay(delay);
  reconnectTimer = window.setTimeout(() => {
    connect();
  }, delay);
}

/** Called once from UI on mount. */
export function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  pendingOps.setSendFn(send);
  connect();
}
