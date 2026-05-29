# Event Sourcing: How State Flows Through the System

This document explains the event layer — how data moves from the DO's SQLite to the browser's reactive collections.

---

## The Two Databases

The DO has one SQLite database, but conceptually it stores two categories of data:

### 1. Event Log (`events` table)

```sql
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  op_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

Every mutation produces one or more events. Events are append-only — nothing is ever deleted or updated in this table.

### 2. Materialized State (all other tables)

Tables like `workspaces`, `threads`, `messages`, `message_parts`, `attachments`, etc. These represent the current state after applying all events.

---

## The Write Path: `EventStore.insertEvent()`

`src/server/event-store.ts:33`

```typescript
insertEvent<T extends SyncEventType>(
  opId: string | null,
  eventType: T,
  payload: SyncEventPayloadMap[T],
): SyncServerEvent<T> {
  const event = this.syncEventStore.insertEvent(opId, eventType, payload);
  return event as SyncServerEvent<T>;
}
```

This delegates to `@shedflare/sync-protocol`'s `SyncEventStore`, which does two things in a single SQLite transaction:

**Step 1: Write to the events table**

```sql
INSERT INTO events (event_id, op_id, type, payload_json, created_at)
VALUES (?, ?, ?, ?, ?)
```

The `seq` auto-increments, giving each event a monotonically increasing sequence number.

**Step 2: Apply to materialized state**

```typescript
// sync-protocol's SyncEventStore calls this callback:
(eventType, payload) => {
  this.applyEventToMaterializedState({ eventType, payload });
}
```

`applyEventToMaterializedState()` is a giant switch statement (`src/server/event-store.ts:131`) that translates each event type to the appropriate SQL mutation:

```typescript
private applyEventToMaterializedState(input: { eventType: SyncEventType; payload: any }) {
  switch (eventType) {
    case "message_upserted": {
      const row = payload.row;
      this.access.exec(
        `INSERT OR REPLACE INTO messages
         (id, thread_id, parent_message_id, source_message_id, role, status,
          model_id, reasoning_level, text, created_at, updated_at, error_code,
          error_message, search_enabled, duration_ms, ttft_ms, prompt_tokens,
          completion_tokens, optimistic, op_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id, row.threadId, row.parentMessageId, row.sourceMessageId,
        row.role, row.status, row.modelId, row.reasoningLevel, row.text,
        row.createdAt, row.updatedAt, row.errorCode, row.errorMessage,
        boolToSql(row.searchEnabled), row.durationMs, row.ttftMs,
        row.promptTokens, row.completionTokens,
        boolToSql(row.optimistic), row.opId ?? null,
      );
      break;
    }
    case "message_delta": {
      // Delta doesn't overwrite — it reads the current row, appends text,
      // and re-inserts via message_upserted
      const row = this.access.getMessage(payload.messageId);
      // ... merge text, set status="streaming" ...
      this.applyEventToMaterializedState({
        eventType: "message_upserted",
        payload: { row: merged },
      });
      break;
    }
    // ... 20+ more event types
  }
}
```

### Why `message_delta` Converts to `message_upserted`

The materialized tables store current state, not events. So a delta event needs to:
1. Read the current message row
2. Append the delta to `text`
3. Set `status = "streaming"`
4. Write it back via `INSERT OR REPLACE`

The sync protocol layer handles this translation. Downstream (both on the server and on the client), `message_delta` is the event type, but the materialized state just sees an upsert.

---

## The Read Path: Snapshots

When a client connects (or reconnects after a protocol version mismatch), it receives a full snapshot of the materialized state.

### Server-side Snapshot Building

`src/server/data-access.ts:409`

```typescript
getSnapshot(): SyncSnapshot {
  return {
    serverSeq: this.getLastServerSeq(),
    tables: {
      [TABLES.workspaces]: this.readTable("workspaces"),
      [TABLES.accountSettings]: this.readTable("account_settings"),
      [TABLES.threads]: this.readTable("threads"),
      [TABLES.messages]: this.readTable("messages"),
      [TABLES.messageParts]: this.readTable("message_parts"),
      [TABLES.attachments]: this.readTable("attachments"),
      [TABLES.searchRuns]: this.readTable("search_runs"),
      [TABLES.searchResults]: this.readTable("search_results"),
      [TABLES.extractRuns]: this.readTable("extract_runs"),
      [TABLES.traceRuns]: this.readTable("trace_runs"),
      [TABLES.traceSpans]: this.readTable("trace_spans"),
    },
  };
}
```

Each table is read as `SELECT *` and inflated back to typed objects via `inflateRow()`:

```typescript
readTable(tableName: string) {
  const rows = this.queryAll<Record<string, unknown>>(`SELECT * FROM ${tableName}`);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    const parsed = inflateRow(tableName, row) as { id: string };
    result[parsed.id] = parsed;  // Keyed by ID
  }
  return result;
}
```

The snapshot is an object like:

```json
{
  "serverSeq": 42,
  "tables": {
    "workspaces": { "wrk_abc": { "id": "wrk_abc", "name": "Default Workspace", ... } },
    "threads": { "thd_xyz": { "id": "thd_xyz", "title": "New Chat", ... } },
    "messages": {
      "msg_123": { "id": "msg_123", "text": "Hello", ... },
      "msg_456": { "id": "msg_456", "text": "Hi there!", ... }
    }
  }
}
```

### Snapshot Delivery

Snapshots are delivered in a `sync_reset` envelope:

```typescript
// sync-engine.ts — when an error occurs or on first hello
ws.send(JSON.stringify({
  type: "sync_reset",
  reason: "initial_sync",
  protocolVersion: SYNC_PROTOCOL_VERSION,
  snapshot: this.getSnapshot(),
}));
```

---

## The Client Path: Events → Collections

### Processing Events

`src/lib/sync-adapter.ts:437`

```typescript
export function processEnvelopes(envelopes: SyncServerEnvelope[]) {
  for (const envelope of envelopes) {
    switch (envelope.type) {
      case "event":
        // Batch consecutive events, coalesce deltas, apply to collections
        applyEvent(event.eventType, event.payload);
        break;
      case "ack":
        confirmOp(envelope.opId);     // Remove from optimistic tracking
        pendingOps.resolve(envelope.opId);
        break;
      case "reject":
        rollbackOp(envelope.opId);    // Rollback optimistic updates
        pendingOps.reject(envelope.opId, envelope.reason);
        break;
      case "sync_reset":
        applySnapshot(envelope.snapshot.tables);  // Replace all collections
        break;
    }
  }
}
```

### Delta Coalescing

Before applying events to collections, consecutive `message_delta` events are merged:

```typescript
function coalesceDeltas(envelopes: EventEnvelope[]): EventEnvelope[] {
  const merged: EventEnvelope[] = [];
  for (const envelope of envelopes) {
    const previous = merged.at(-1);
    if (
      previous?.eventType === "message_delta" &&
      envelope.eventType === "message_delta" &&
      bothHaveSameMessageId
    ) {
      // Merge: concatenate deltas, keep latest serverSeq
      previous.payload.delta += envelope.payload.delta;
      previous.serverSeq = envelope.serverSeq;
      continue;
    }
    merged.push(envelope);
  }
  return merged;
}
```

This prevents unnecessary re-renders when multiple deltas arrive in the same batch.

### Batched Writes to Collections

Events are applied in batches to reduce reactive churn in TanStack DB:

```typescript
beginBatch();
for (const evt of coalesced) {
  applyEvent(evt.eventType, evt.payload);
}
flushBatch();
```

`flushBatch()` creates one transaction per collection:

```typescript
function flushBatch() {
  for (const [collectionId, ops] of activeBatch) {
    const writer = getSyncWriter(collectionId);
    writer.begin();
    for (const op of ops) {
      writer.write(op);  // insert, update, or delete
    }
    writer.commit();
  }
}
```

---

## The Client Path: Snapshots → Collections

When a `sync_reset` arrives, the entire state is replaced:

```typescript
function applySnapshot(tables: SyncTables | undefined) {
  for (const [tableName, collectionId] of Object.entries(TABLE_TO_COLLECTION)) {
    const writer = getSyncWriter(collectionId);
    writer.begin();
    writer.truncate();                     // Remove all existing data
    const rows = tables[tableName];
    if (rows) {
      for (const value of Object.values(rows)) {
        writer.write({ type: "insert", value });  // Insert fresh data
      }
    }
    writer.commit();
    writer.markReady();                    // Signal collection is ready
  }
}
```

The snapshot is also persisted to IndexedDB for offline hydration:

```typescript
void writeCachedSnapshot(envelope.snapshot.tables, envelope.snapshot.serverSeq);
```

On page load, the IndexedDB snapshot is read before the WebSocket connects, giving instant data:

```typescript
// sync-adapter.ts init()
const cached = await readCachedSnapshot();
if (cached) {
  conn.setLastServerSeq(cached.lastServerSeq);
  applySnapshot(cached.tables);
}
```

### Why Both Events and Snapshots?

| | Events | Snapshots |
|---|---|---|
| **When** | Real-time updates during a session | On connect, reconnect, or error recovery |
| **Size** | Small (one mutation) | Large (full state) |
| **Frequency** | High (every token delta) | Low (once per connection) |
| **Purpose** | Incremental sync | Full state hydration |

This is a common pattern in event-sourced systems: use events for real-time updates and snapshots for initial hydration and crash recovery.

---

## The Event Payload Types

All event types and their payloads are defined in `src/domain/index.ts` as Effect Schema structs:

```typescript
export const EventPayloadSchemas = {
  // Entity CRUD
  account_settings_upserted: Schema.Struct({ row: AccountSettingsRow }),
  workspace_upserted:         Schema.Struct({ row: WorkspaceRow }),
  workspace_archived:         Schema.Struct({ id, archivedAt, updatedAt }),
  thread_upserted:            Schema.Struct({ row: ThreadRow }),
  thread_archived:            Schema.Struct({ id, archivedAt, updatedAt }),
  thread_deleted:             Schema.Struct({ id }),
  message_upserted:           Schema.Struct({ row: MessageRow }),
  message_failed:             Schema.Struct({ messageId, errorCode, errorMessage, updatedAt }),
  message_completed:          Schema.Struct({ messageId, text, updatedAt, durationMs, ttftMs, ... }),
  message_delta:              Schema.Struct({ messageId, delta, updatedAt }),
  message_part_appended:      Schema.Struct({ row: MessagePartRow }),
  attachment_upserted:        Schema.Struct({ row: AttachmentRow }),
  attachment_deleted:         Schema.Struct({ id }),

  // Replaceable collections (delete-all + insert-all per message)
  search_runs_replaced:       Schema.Struct({ messageId, rows: Schema.Array(SearchRunRow) }),
  search_results_replaced:    Schema.Struct({ messageId, rows: Schema.Array(SearchResultRow) }),
  extract_runs_replaced:      Schema.Struct({ messageId, rows: Schema.Array(ExtractRunRow) }),
  trace_run_upserted:         Schema.Struct({ row: TraceRunRow }),
  trace_span_upserted:        Schema.Struct({ row: TraceSpanRow }),

  // Full state replacement
  server_state_rebased:       Schema.Struct({ snapshot: SyncSnapshotSchema }),
} as const;
```

### Why "replaced" Instead of "upserted" for Search/Extract?

Search runs and results are replaced wholesale per message because:
1. They are produced in batches by the search tool
2. The UI needs the full set to render correctly
3. Partial updates would be more complex and error-prone
4. The collections are small (at most a few dozen rows per message)

The `replace` pattern is: `DELETE FROM search_runs WHERE message_id = ?` then `INSERT` each row.

---

## Protocol Versioning

`src/domain/index.ts:33`

```typescript
export const SYNC_PROTOCOL_VERSION = "effect4-search-limit-v1";
```

This version string is checked on every `hello`:

```typescript
// Server side
if (hello.protocolVersion !== SYNC_PROTOCOL_VERSION) {
  // Send sync_reset with full snapshot — client will reload
  ws.send(JSON.stringify({
    type: "sync_reset",
    reason: "protocol_mismatch",
    protocolVersion: SYNC_PROTOCOL_VERSION,
    snapshot: this.getSnapshot(),
  }));
}

// Client side
if (envelope.protocolVersion !== SYNC_PROTOCOL_VERSION) {
  pendingOps.clear();
  resetCollections();
  window.location.reload();  // Reload to pick up new client code
}
```

When the protocol version changes (because a new table was added or the schema changed), all existing data is wiped and rebuilt:

```typescript
// schema.ts
if (version?.value !== SYNC_PROTOCOL_VERSION) {
  resetForProtocolVersion(exec);  // DELETE FROM all tables, set new version
}
```

This is safe because this is a personal app — there is no production data that needs migration. For a multi-user app, you'd need proper migrations. Here, the worst case is losing chat history, which is acceptable for a self-hosted personal tool.

---

## Full Event Flow Diagram

```
                ┌─────────────────────────────────────┐
                │           Durable Object             │
                │                                      │
                │  ┌──────────────┐   ┌──────────────┐ │
                │  │  Events      │   │  Materialized│ │
                │  │  Table       │◄──│  Tables      │ │
                │  │  (append)    │   │  (upsert)    │ │
                │  └──────────────┘   └──────┬───────┘ │
                │         ▲                  │         │
                │         │    tx: write     │         │
                │         │    event +       │         │
                │         │    apply state   │         │
                │         │                  │         │
                │  ┌──────┴──────────────┐   │         │
                │  │  EventStore         │   │         │
                │  │  insertEvent()      │   │         │
                │  └──────┬──────────────┘   │         │
                │         │                  │         │
                │         ▼                  ▼         │
                │  ┌──────────────────────────────┐    │
                │  │  processChatCommand()         │    │
                │  │  - dedup                      │    │
                │  │  - validate (Effect Schema)   │    │
                │  │  - run handler                │    │
                │  │  - broadcast events           │    │
                │  └──────────────┬───────────────┘    │
                └─────────────────┼────────────────────┘
                                  │
                    WebSocket     │
                    broadcast     │
                                  ▼
                ┌─────────────────────────────────────┐
                │          Browser Client              │
                │                                      │
                │  ┌──────────────────────────────┐    │
                │  │  ws-connection.ts             │    │
                │  │  receives envelopes           │    │
                │  └──────────┬───────────────────┘    │
                │             │                        │
                │             ▼                        │
                │  ┌──────────────────────────────┐    │
                │  │  sync-adapter.ts              │    │
                │  │  processEnvelopes()           │    │
                │  │  - coalesce deltas            │    │
                │  │  - batch writes               │    │
                │  │  - apply mutations            │    │
                │  └──────────┬───────────────────┘    │
                │             │                        │
                │             ▼                        │
                │  ┌──────────────────────────────┐    │
                │  │  TanStack DB Collections      │    │
                │  │  (11 reactive stores)         │    │
                │  └──────────┬───────────────────┘    │
                │             │                        │
                │             ▼                        │
                │  ┌──────────────────────────────┐    │
                │  │  SolidJS reactive rendering   │    │
                │  │  (createMemo chains)          │    │
                │  └──────────────────────────────┘    │
                └─────────────────────────────────────┘
```
