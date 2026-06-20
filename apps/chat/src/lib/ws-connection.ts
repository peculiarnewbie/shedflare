import {
  SYNC_PROTOCOL_VERSION,
  createId,
  decodeSyncServerEnvelope,
  type SyncServerEnvelope,
} from "#/domain";
import { createSignal } from "solid-js";
import { refreshAuthSession } from "./auth-fetch";
import * as pendingOps from "./pending-ops";

// ---------------------------------------------------------------------------
// Persistent client identity & sync cursor
// ---------------------------------------------------------------------------

const CLIENT_ID_KEY = "shedflare.clientId";
const LAST_SERVER_SEQ_KEY = "shedflare.lastServerSeq";
const STUCK_DEBUG_PREFIX = "CHAT_DEBUG_STUCK_GENERATING";

function rawByteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function frameDebugSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { envelopeType: typeof value };
  }
  const record = value as Record<string, unknown>;
  const payload =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : null;
  return {
    envelopeType: record.type ?? null,
    eventType: record.eventType ?? null,
    serverSeq: record.serverSeq ?? null,
    eventId: record.eventId ?? null,
    opId: record.opId ?? null,
    messageId: typeof payload?.messageId === "string" ? payload.messageId : null,
    textLength: typeof payload?.text === "string" ? payload.text.length : null,
    deltaLength: typeof payload?.delta === "string" ? payload.delta.length : null,
  };
}

function shouldLogFrame(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const record = value as Record<string, unknown>;
  if (record.type !== "event") return true;
  if (record.eventType !== "message_delta") return true;
  return typeof record.serverSeq === "number" && record.serverSeq % 25 === 0;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn("[ws] failed to parse localStorage value for", key);
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
// Envelope callback — set by sync-adapter
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

  // If more envelopes arrived during processing, schedule again
  if (incomingQueue.length > 0 && !flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}

// ---------------------------------------------------------------------------
// WebSocket lifecycle
// ---------------------------------------------------------------------------

let socket: WebSocket | undefined;
let reconnectAttempt = 0;
let reconnectTimer: number | undefined;
let started = false;

const [isConnected, setIsConnected] = createSignal(false);
export { isConnected };

function syncLog(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[ws] ${message}`, details);
    return;
  }
  console.log(`[ws] ${message}`);
}

function send(message: object) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function connect() {
  if (typeof window === "undefined") return;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  syncLog("connect", { clientId, lastServerSeq });
  const ws = new WebSocket(`${protocol}//${location.host}/api/sync/ws`);
  socket = ws;

  ws.addEventListener("open", () => {
    reconnectAttempt = 0;
    setIsConnected(true);
    syncLog("open", { pendingOps: pendingOps.unackedOpIds().length });
    send({
      type: "hello",
      clientId,
      protocolVersion: SYNC_PROTOCOL_VERSION,
      lastServerSeq,
      unackedOpIds: pendingOps.unackedOpIds(),
    });
  });

  ws.addEventListener("message", ({ data }) => {
    const raw = String(data);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.warn(`[${STUCK_DEBUG_PREFIX}] ws_frame_json_parse_error`, {
        rawBytes: rawByteLength(raw),
        preview: raw.slice(0, 300),
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (shouldLogFrame(parsed)) {
      console.log(`[${STUCK_DEBUG_PREFIX}] ws_frame_received`, {
        ...frameDebugSummary(parsed),
        rawBytes: rawByteLength(raw),
        lastServerSeq,
      });
    }

    try {
      const envelope = decodeSyncServerEnvelope(parsed);
      if (envelope) {
        enqueueEnvelope(envelope);
        return;
      }
      console.warn(`[${STUCK_DEBUG_PREFIX}] ws_frame_decode_returned_null`, {
        ...frameDebugSummary(parsed),
        rawBytes: rawByteLength(raw),
      });
    } catch (error) {
      console.warn(`[${STUCK_DEBUG_PREFIX}] ws_frame_decode_error`, {
        ...frameDebugSummary(parsed),
        rawBytes: rawByteLength(raw),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  ws.addEventListener("close", (event) => {
    syncLog("close", {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      lastServerSeq,
      queuedFrames: incomingQueue.length,
    });
    console.warn(`[${STUCK_DEBUG_PREFIX}] ws_close`, {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      lastServerSeq,
      queuedFrames: incomingQueue.length,
      pendingOps: pendingOps.unackedOpIds(),
    });
    setIsConnected(false);
    scheduleReconnect();
  });

  ws.addEventListener("error", () => {
    syncLog("error");
    setIsConnected(false);
  });
}

function scheduleReconnect() {
  if (typeof window === "undefined") return;
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  const delay = Math.min(10_000, 500 * 2 ** reconnectAttempt++);
  reconnectTimer = window.setTimeout(() => {
    void refreshAuthSession()
      .finally(() => connect())
      .catch(() => {
        console.warn("[ws] refreshAuthSession failed, connecting anyway");
      });
  }, delay);
}

/** Called once from UI onMount. */
export function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  pendingOps.setSendFn(send);
  connect();
}
