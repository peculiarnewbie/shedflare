import {
  mergeAttachmentLink,
  SYNC_PROTOCOL_VERSION,
  TABLES,
  type JsonObject,
  type SyncServerEnvelope,
  type SyncTables,
} from "#/domain";
import type { Message } from "#/domain";
import * as conn from "./ws-connection";
import * as pendingOps from "./pending-ops";
import { ensureActiveSelection } from "./ui-state";
import {
  workspaces,
  accountSettings,
  threads,
  messages,
  messageParts,
  attachments,
  searchRuns,
  searchResults,
  extractRuns,
  traceRuns,
  traceSpans,
  comparisonGroups,
  getSyncWriter,
  resetCollections,
  TABLE_TO_COLLECTION,
  type CollectionId,
} from "./collections";
import { reconcileDraftState } from "./draft-state";
import { confirmOp, rollbackOp } from "./actions";
import { readCachedSnapshot, writeCachedSnapshot } from "./offline-cache";
import { debugLog, isChatDebugEnabled } from "./client-debug";

function isBusyStatus(status: Message["status"]) {
  return status === "queued" || status === "pending" || status === "streaming";
}

function debugSync(event: string, details?: JsonObject) {
  debugLog("sync", event, details);
}

function debugMessageSnapshot(messageId: string) {
  const row = messages.get(messageId);
  return row
    ? {
        exists: true,
        id: row.id,
        threadId: row.threadId,
        role: row.role,
        status: row.status,
        textLength: row.text?.length ?? 0,
        updatedAt: row.updatedAt,
        optimistic: row.optimistic ?? null,
        opId: row.opId ?? null,
      }
    : { exists: false, id: messageId };
}

// ---------------------------------------------------------------------------
// Delta coalescing
// ---------------------------------------------------------------------------

type EventEnvelope = Extract<SyncServerEnvelope, { type: "event" }>;

function rowsById<T extends { id: string }>(rows: Iterable<T>) {
  return Object.fromEntries(Array.from(rows, (row) => [row.id, row]));
}

function buildCachedSnapshotTables() {
  return {
    [TABLES.workspaces]: rowsById(workspaces.state.values()),
    [TABLES.accountSettings]: rowsById(accountSettings.state.values()),
    [TABLES.threads]: rowsById(threads.state.values()),
    [TABLES.messages]: rowsById(messages.state.values()),
    [TABLES.messageParts]: rowsById(messageParts.state.values()),
    [TABLES.attachments]: rowsById(attachments.state.values()),
    [TABLES.searchRuns]: rowsById(searchRuns.state.values()),
    [TABLES.searchResults]: rowsById(searchResults.state.values()),
    [TABLES.extractRuns]: rowsById(extractRuns.state.values()),
    [TABLES.traceRuns]: rowsById(traceRuns.state.values()),
    [TABLES.traceSpans]: rowsById(traceSpans.state.values()),
    [TABLES.comparisonGroups]: rowsById(comparisonGroups.state.values()),
  };
}

function coalesceDeltas(envelopes: EventEnvelope[]): EventEnvelope[] {
  const merged: EventEnvelope[] = [];
  for (const envelope of envelopes) {
    const previous = merged.at(-1);
    if (
      previous?.eventType === "message_delta" &&
      envelope.eventType === "message_delta" &&
      previous.payload.messageId === envelope.payload.messageId
    ) {
      const prev = previous.payload;
      const next = envelope.payload;
      previous.serverSeq = envelope.serverSeq;
      previous.eventId = envelope.eventId;
      previous.causedByOpId = envelope.causedByOpId;
      previous.payload = {
        ...prev,
        delta: `${prev.delta}${next.delta}`,
        updatedAt: next.updatedAt,
      };
      continue;
    }
    merged.push(envelope);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Helpers to push data through the sync writer (server-authoritative data)
// ---------------------------------------------------------------------------

const COLLECTION_MAP = {
  workspaces,
  accountSettings,
  threads,
  messages,
  messageParts,
  attachments,
  searchRuns,
  searchResults,
  extractRuns,
  traceRuns,
  traceSpans,
  comparisonGroups,
};

function hasRow(collectionId: CollectionId, key: string) {
  return Boolean(COLLECTION_MAP[collectionId]?.get(key));
}

// ---------------------------------------------------------------------------
// Batched sync writes — consecutive server events are grouped into one
// begin()/commit() per collection, cutting reactive churn in TanStack DB.
// ---------------------------------------------------------------------------

type BatchEntry = { type: "insert" | "update"; value: object } | { type: "delete"; key: string };

let activeBatch: Map<CollectionId, BatchEntry[]> | null = null;

function getPendingBatchValue<T extends { id: string }>(
  collectionId: CollectionId,
  key: string,
): T | null {
  const ops = activeBatch?.get(collectionId);
  if (!ops) return null;
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]!;
    if (op.type === "delete") {
      if (op.key === key) return null;
      continue;
    }
    // SAFETY: callers request the row type owned by collectionId; batches only receive that collection's rows.
    const value = op.value as T;
    if (value.id === key) return value;
  }
  return null;
}

function beginBatch() {
  activeBatch = new Map();
}

function pushBatchOp(collectionId: CollectionId, op: BatchEntry) {
  if (!activeBatch) {
    const writer = getSyncWriter(collectionId);
    if (!writer) return;
    writer.begin({ immediate: true });
    writer.write(
      op.type === "delete" ? { key: op.key, type: "delete" } : { type: op.type, value: op.value },
    );
    writer.commit();
    return;
  }
  const list = activeBatch.get(collectionId) ?? [];
  list.push(op);
  activeBatch.set(collectionId, list);
}

function flushBatch() {
  if (!activeBatch) return;
  for (const [collectionId, ops] of activeBatch) {
    const writer = getSyncWriter(collectionId);
    if (!writer) continue;
    writer.begin();
    for (const op of ops) {
      writer.write(
        op.type === "delete" ? { key: op.key, type: "delete" } : { type: op.type, value: op.value },
      );
    }
    writer.commit();
  }
  activeBatch = null;
}

function syncUpsert<T extends object>(collectionId: CollectionId, _key: string, value: T) {
  pushBatchOp(collectionId, { type: hasRow(collectionId, _key) ? "update" : "insert", value });
}

function syncUpdate<T extends object>(collectionId: CollectionId, _key: string, value: T) {
  pushBatchOp(collectionId, { type: "update", value });
}

function syncDelete(collectionId: CollectionId, key: string) {
  pushBatchOp(collectionId, { type: "delete", key });
}

// ---------------------------------------------------------------------------
// Event handlers — server events → collection mutations
// ---------------------------------------------------------------------------

function applyEvent(envelope: EventEnvelope) {
  switch (envelope.eventType) {
    case "workspace_upserted": {
      const event = envelope.payload;
      syncUpsert("workspaces", event.row.id, event.row);
      break;
    }
    case "account_settings_upserted": {
      const event = envelope.payload;
      syncUpsert("accountSettings", event.row.id, event.row);
      break;
    }
    case "workspace_archived": {
      const event = envelope.payload;
      const existing = workspaces.get(event.id);
      if (existing) {
        syncUpdate("workspaces", event.id, {
          ...existing,
          archivedAt: event.archivedAt,
          updatedAt: event.updatedAt,
        });
      }
      break;
    }
    case "thread_upserted": {
      const event = envelope.payload;
      syncUpsert("threads", event.row.id, event.row);
      break;
    }
    case "thread_archived": {
      const event = envelope.payload;
      const existing = threads.get(event.id);
      if (existing) {
        syncUpdate("threads", event.id, {
          ...existing,
          archivedAt: event.archivedAt,
          updatedAt: event.updatedAt,
        });
      }
      break;
    }
    case "thread_deleted": {
      const event = envelope.payload;
      syncDelete("threads", event.id);
      // Remove all messages for this thread
      for (const [key, message] of messages.state.entries()) {
        if (message.threadId === event.id) {
          syncDelete("messages", key);
        }
      }
      // Remove attachments for this thread
      for (const [key, attachment] of attachments.state.entries()) {
        if (attachment.threadId === event.id) {
          syncDelete("attachments", key);
        }
      }
      break;
    }
    case "message_upserted": {
      const event = envelope.payload;
      if (event.row.role === "assistant" || isBusyStatus(event.row.status)) {
        debugSync("message_upserted_apply", {
          messageId: event.row.id,
          incomingStatus: event.row.status,
          incomingTextLength: event.row.text?.length ?? 0,
          before: debugMessageSnapshot(event.row.id),
        });
      }
      syncUpsert("messages", event.row.id, event.row);
      break;
    }
    case "message_delta": {
      const event = envelope.payload;
      const existing =
        getPendingBatchValue<Message>("messages", event.messageId) ?? messages.get(event.messageId);
      if (existing) {
        // Guard: don't regress completed → streaming
        if (existing.status === "completed") {
          debugSync("message_delta_ignored_completed", {
            messageId: event.messageId,
            deltaLength: event.delta.length,
            existing: debugMessageSnapshot(event.messageId),
          });
          break;
        }
        syncUpdate("messages", event.messageId, {
          ...existing,
          text: `${existing.text}${event.delta}`,
          status: "streaming",
          updatedAt: event.updatedAt,
        });
      } else {
        debugSync("message_delta_ignored_missing_message", {
          messageId: event.messageId,
          deltaLength: event.delta.length,
        });
      }
      break;
    }
    case "message_completed": {
      const event = envelope.payload;
      const existing =
        getPendingBatchValue<Message>("messages", event.messageId) ?? messages.get(event.messageId);
      debugSync("message_completed_apply_start", {
        messageId: event.messageId,
        incomingTextLength: event.text.length,
        incomingDurationMs: event.durationMs ?? null,
        incomingTtftMs: event.ttftMs ?? null,
        existing: existing
          ? {
              status: existing.status,
              textLength: existing.text?.length ?? 0,
              updatedAt: existing.updatedAt,
              optimistic: existing.optimistic ?? null,
              opId: existing.opId ?? null,
            }
          : null,
        pendingBatchHadMessage: Boolean(getPendingBatchValue<Message>("messages", event.messageId)),
      });
      if (existing) {
        syncUpdate("messages", event.messageId, {
          ...existing,
          text: event.text,
          status: "completed",
          updatedAt: event.updatedAt,
          durationMs: event.durationMs ?? null,
          ttftMs: event.ttftMs ?? null,
          promptTokens: event.promptTokens ?? null,
          completionTokens: event.completionTokens ?? null,
        });
      } else {
        debugSync("message_completed_ignored_missing_message", {
          messageId: event.messageId,
          incomingTextLength: event.text.length,
        });
      }
      break;
    }
    case "message_failed": {
      const event = envelope.payload;
      const existing =
        getPendingBatchValue<Message>("messages", event.messageId) ?? messages.get(event.messageId);
      debugSync("message_failed_apply_start", {
        messageId: event.messageId,
        errorCode: event.errorCode,
        existing: existing
          ? {
              status: existing.status,
              textLength: existing.text?.length ?? 0,
              updatedAt: existing.updatedAt,
            }
          : null,
      });
      if (existing) {
        syncUpdate("messages", event.messageId, {
          ...existing,
          status: "failed",
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
          updatedAt: event.updatedAt,
        });
      }
      break;
    }
    case "message_part_appended": {
      const event = envelope.payload;
      syncUpsert("messageParts", event.row.id, event.row);
      break;
    }
    case "attachment_upserted": {
      const event = envelope.payload;
      const existing = attachments.get(event.row.id);
      const merged = mergeAttachmentLink(existing ?? null, event.row);
      syncUpsert("attachments", event.row.id, merged);
      break;
    }
    case "attachment_deleted": {
      const event = envelope.payload;
      syncDelete("attachments", event.id);
      break;
    }
    case "search_runs_replaced": {
      const event = envelope.payload;
      // Delete existing runs for this message, then insert new ones
      const srWriter = getSyncWriter("searchRuns");
      if (srWriter) {
        srWriter.begin();
        for (const [key, row] of searchRuns.state.entries()) {
          if (row.messageId === event.messageId) {
            srWriter.write({ key, type: "delete" });
          }
        }
        for (const row of event.rows) {
          srWriter.write({ type: "insert", value: row });
        }
        srWriter.commit();
      }
      break;
    }
    case "search_results_replaced": {
      const event = envelope.payload;
      const resWriter = getSyncWriter("searchResults");
      if (resWriter) {
        resWriter.begin();
        for (const [key, row] of searchResults.state.entries()) {
          if (row.messageId === event.messageId) {
            resWriter.write({ key, type: "delete" });
          }
        }
        for (const row of event.rows) {
          resWriter.write({ type: "insert", value: row });
        }
        resWriter.commit();
      }
      break;
    }
    case "extract_runs_replaced": {
      const event = envelope.payload;
      // Same strategy as search_runs: fully replace this message's rows
      // rather than diff. Keeps the client in lockstep with state.extractRuns
      // on the server.
      const erWriter = getSyncWriter("extractRuns");
      if (erWriter) {
        erWriter.begin();
        for (const [key, row] of extractRuns.state.entries()) {
          if (row.messageId === event.messageId) {
            erWriter.write({ key, type: "delete" });
          }
        }
        for (const row of event.rows) {
          erWriter.write({ type: "insert", value: row });
        }
        erWriter.commit();
      }
      break;
    }
    case "trace_run_upserted": {
      const event = envelope.payload;
      syncUpsert("traceRuns", event.row.id, event.row);
      break;
    }
    case "trace_span_upserted": {
      const event = envelope.payload;
      syncUpsert("traceSpans", event.row.id, event.row);
      break;
    }
    case "comparison_group_upserted": {
      const event = envelope.payload;
      syncUpsert("comparisonGroups", event.row.id, event.row);
      break;
    }
    case "server_state_rebased": {
      const event = envelope.payload;
      applySnapshot(event.snapshot.tables);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Snapshot replacement — sync_reset and server_state_rebased
// ---------------------------------------------------------------------------

export function applyPartialSnapshot(tables: SyncTables | undefined) {
  if (!tables) return;
  for (const [tableName, collectionId] of Object.entries(TABLE_TO_COLLECTION)) {
    const writer = getSyncWriter(collectionId);
    if (!writer) continue;
    // SAFETY: TABLE_TO_COLLECTION contains only server table names represented by SyncTables.
    const rows = tables[tableName as keyof SyncTables];
    if (!rows) continue;
    writer.begin({ immediate: true });
    for (const [key, value] of Object.entries(rows)) {
      writer.write({
        type: hasRow(collectionId, key) ? "update" : "insert",
        value,
      });
    }
    writer.commit();
    writer.markReady();
  }
}

function applySnapshot(tables: SyncTables | undefined) {
  if (!tables) return;
  for (const [tableName, collectionId] of Object.entries(TABLE_TO_COLLECTION)) {
    const writer = getSyncWriter(collectionId);
    if (!writer) continue;
    // Truncate and insert in one transaction
    writer.begin();
    writer.truncate();
    // SAFETY: TABLE_TO_COLLECTION contains only server table names represented by SyncTables.
    const rows = tables[tableName as keyof SyncTables];
    if (rows) {
      for (const [_key, value] of Object.entries(rows)) {
        writer.write({ type: "insert", value });
      }
    }
    writer.commit();
    writer.markReady();
  }
}

// ---------------------------------------------------------------------------
// Envelope processor — called by ws-connection with batched envelopes
// ---------------------------------------------------------------------------

function collectWorkspacesAndThreads() {
  return {
    workspaces: [...workspaces.state.values()],
    threads: [...threads.state.values()],
  };
}

export function processEnvelopes(envelopes: SyncServerEnvelope[]) {
  let index = 0;
  let needsSelectionCheck = false;
  let shouldRefreshCachedSnapshot = false;

  while (index < envelopes.length) {
    const envelope = envelopes[index]!;

    if (envelope.type === "event") {
      // Collect consecutive events, coalesce deltas, apply
      const events: EventEnvelope[] = [];
      while (true) {
        const candidate = envelopes[index];
        if (candidate?.type !== "event") break;
        events.push(candidate);
        index += 1;
      }
      const coalesced = coalesceDeltas(events);
      beginBatch();
      for (const evt of coalesced) {
        if (evt.eventType !== "message_delta" || evt.serverSeq % 25 === 0) {
          debugSync("event_apply", {
            eventType: evt.eventType,
            serverSeq: evt.serverSeq,
            eventId: evt.eventId,
            causedByOpId: evt.causedByOpId ?? null,
          });
        }
        applyEvent(evt);
        if (evt.eventType !== "message_delta") {
          shouldRefreshCachedSnapshot = true;
        }
      }
      flushBatch();
      for (const evt of coalesced) {
        if (evt.eventType === "message_completed" || evt.eventType === "message_failed") {
          const payload = evt.payload;
          debugSync("terminal_event_applied", {
            eventType: evt.eventType,
            serverSeq: evt.serverSeq,
            messageId: payload.messageId,
            after: debugMessageSnapshot(payload.messageId),
          });
        }
      }
      conn.setLastServerSeq(events.at(-1)!.serverSeq);
      needsSelectionCheck = true;
      continue;
    }

    switch (envelope.type) {
      case "hello_ack":
        debugSync("hello_ack", {
          protocolVersion: envelope.protocolVersion,
          serverSeq: envelope.lastServerSeq,
          localSeq: conn.getLastServerSeq(),
        });
        if (envelope.protocolVersion !== SYNC_PROTOCOL_VERSION) {
          pendingOps.clear();
          resetCollections();
          conn.setLastServerSeq(0);
          window.location.reload();
          break;
        }
        // hello_ack announces the server head before replay events arrive. Advancing
        // here can skip replay on reconnect if the socket closes mid-catch-up.
        pendingOps.flushAll();
        break;

      case "ack":
        confirmOp(envelope.opId);
        pendingOps.resolve(envelope.opId);
        if (envelope.serverSeq > conn.getLastServerSeq()) {
          conn.setLastServerSeq(envelope.serverSeq);
        }
        break;

      case "reject":
        rollbackOp(envelope.opId);
        pendingOps.reject(envelope.opId, envelope.reason);
        needsSelectionCheck = true;
        break;

      case "sync_reset":
        debugSync("sync_reset", {
          reason: envelope.reason,
          protocolVersion: envelope.protocolVersion,
          serverSeq: envelope.snapshot.serverSeq ?? null,
          tables: Object.keys(envelope.snapshot.tables ?? {}),
          workspaceCount: Object.keys(envelope.snapshot.tables?.workspaces ?? {}).length,
          threadCount: Object.keys(envelope.snapshot.tables?.threads ?? {}).length,
        });
        if (envelope.reason !== "initial_sync") {
          pendingOps.clear();
        }
        applySnapshot(envelope.snapshot.tables);
        if (envelope.snapshot.serverSeq !== undefined) {
          conn.setLastServerSeq(envelope.snapshot.serverSeq);
        }
        needsSelectionCheck = true;
        shouldRefreshCachedSnapshot = true;
        // Persist snapshot so next page load can hydrate instantly
        void writeCachedSnapshot(
          envelope.snapshot.tables ?? {},
          envelope.snapshot.serverSeq ?? conn.getLastServerSeq(),
        );
        break;
    }
    index += 1;
  }

  if (needsSelectionCheck) {
    const { workspaces: ws, threads: ts } = collectWorkspacesAndThreads();
    reconcileDraftState(ws, ts);
    debugSync("ensure_active_selection", {
      workspaceCount: ws.length,
      threadCount: ts.length,
      workspaceIds: ws.map((w) => w.id),
    });
    ensureActiveSelection(ws, ts);
  }

  if (shouldRefreshCachedSnapshot) {
    void writeCachedSnapshot(buildCachedSnapshotTables(), conn.getLastServerSeq());
  }
}

// ---------------------------------------------------------------------------
// Initialization — wire up the ws-connection callback
// ---------------------------------------------------------------------------

export async function init() {
  conn.setOnEnvelopes(processEnvelopes);
  if (globalThis.window && isChatDebugEnabled()) {
    window.setInterval(() => {
      const busy = [...messages.state.values()]
        .filter((message) => message.role === "assistant" && isBusyStatus(message.status))
        .map((message) => ({
          id: message.id,
          threadId: message.threadId,
          status: message.status,
          textLength: message.text?.length ?? 0,
          updatedAt: message.updatedAt,
          opId: message.opId ?? null,
          traceStatuses: [...traceRuns.state.values()]
            .filter((run) => run.messageId === message.id)
            .map((run) => ({ id: run.id, status: run.status, endedAt: run.endedAt ?? null })),
        }));
      if (busy.length === 0) return;
      debugSync("busy_message_watchdog", {
        lastServerSeq: conn.getLastServerSeq(),
        busy,
      });
    }, 10_000);
  }

  // Mark all collections as ready immediately — with empty data — so the UI
  // renders without waiting for IndexedDB. Data hydrates async afterwards.
  for (const [, collectionId] of Object.entries(TABLE_TO_COLLECTION)) {
    const writer = getSyncWriter(collectionId);
    writer?.markReady();
  }

  // Try to hydrate from IndexedDB cache before WS connects
  const cached = await readCachedSnapshot();
  if (cached) {
    debugSync("offline_cache_hydrated", {
      lastServerSeq: cached.lastServerSeq,
      tableCount: Object.keys(cached.tables).length,
    });
    conn.setLastServerSeq(cached.lastServerSeq);
    applySnapshot(cached.tables);
    const { workspaces: ws, threads: ts } = collectWorkspacesAndThreads();
    reconcileDraftState(ws, ts);
  } else if (conn.getLastServerSeq() > 0) {
    // Offline cache was cleared but localStorage still has a stale cursor.
    // Reset to 0 so the server sends a full sync_reset on reconnect —
    // otherwise the client stays stuck with empty data and a cursor ahead
    // of the server head, receiving no events.
    debugSync("offline_cache_missing_reset_cursor", {
      from: conn.getLastServerSeq(),
      to: 0,
    });
    conn.setLastServerSeq(0);
  }
}
