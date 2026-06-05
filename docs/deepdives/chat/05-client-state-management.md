# Client-Side State Management

This document covers how the browser manages state: the reactive collections, the optimistic update system, the draft/persistence layer, and how it all connects to the server.

---

## Architecture Overview

```
                    ┌─────────────────────┐
                    │   WebSocket          │
                    │   (ws-connection.ts) │
                    └────────┬────────────┘
                             │ envelopes
                             ▼
                    ┌─────────────────────┐
                    │   sync-adapter.ts    │
                    │   processEnvelopes() │
                    └────┬──────┬─────────┘
                         │      │
            events/ack   │      │ sync_reset
            /reject      │      │ (snapshot)
                         │      ▼
                         │  ┌──────────────────┐
                         │  │ applySnapshot()   │
                         │  └────────┬─────────┘
                         │           │
                         ▼           ▼
                    ┌─────────────────────┐
                    │  TanStack DB        │
                    │  Collections (11)   │
                    │                     │
                    │  workspaces         │
                    │  accountSettings    │
                    │  threads            │
                    │  messages           │
                    │  messageParts       │
                    │  attachments        │
                    │  searchRuns         │
                    │  searchResults      │
                    │  extractRuns        │
                    │  traceRuns          │
                    │  traceSpans         │
                    └────────┬────────────┘
                             │ reactive
                             ▼
                    ┌─────────────────────┐
                    │  SolidJS UI         │
                    │  (createMemo,       │
                    │   createSignal)     │
                    └─────────────────────┘
```

---

## 1. TanStack DB Collections

`src/lib/collections.ts`

Each server table maps to a client-side reactive collection. Collections are created via `createSyncedCollection()`:

```typescript
function createSyncedCollection<T extends object>(id: string, getKey: (item: T) => string) {
  return createCollection<T, string>({
    id,
    getKey,
    startSync: true,
    utils: {},
    sync: {
      sync: ({ begin, write, commit, markReady, truncate }) => {
        channels.set(id, { begin, write, commit, markReady, truncate });
        return () => channels.delete(id);
      },
    },
    // Optimistic writes go through mutation handlers (but we bypass these
    // via the sync channel for immediate local effects)
    onInsert: () => Promise.resolve(),
    onUpdate: () => Promise.resolve(),
    onDelete: () => Promise.resolve(),
  });
}
```

The `sync` callback provides a writer interface (`begin/write/commit/markReady/truncate`) that the sync adapter uses to push data into the collection. The `onInsert/onUpdate/onDelete` callbacks are no-ops because writes come through the sync channel, not through those hooks.

### The 11 Collections

| Collection        | Key           | Purpose                                    |
| ----------------- | ------------- | ------------------------------------------ |
| `workspaces`      | workspace.id  | Workspace configs                          |
| `accountSettings` | `"default"`   | Global settings                            |
| `threads`         | thread.id     | Chat threads                               |
| `messages`        | message.id    | Messages in threads                        |
| `messageParts`    | part.id       | Stream parts (text, reasoning, activities) |
| `attachments`     | attachment.id | File attachments                           |
| `searchRuns`      | run.id        | Web search records                         |
| `searchResults`   | result.id     | Search result items                        |
| `extractRuns`     | run.id        | Browser extract records                    |
| `traceRuns`       | run.id        | Trace runs                                 |
| `traceSpans`      | span.id       | Trace spans                                |

### SyncWriter Interface

```typescript
export type SyncWriter<T extends object, TKey extends string | number = string> = {
  begin: (options?: { immediate?: boolean }) => void;
  write: (msg: ChangeMessageOrDeleteKeyMessage<T, TKey>) => void;
  commit: () => void;
  markReady: () => void;
  truncate: () => void;
};
```

Usage:

```typescript
const writer = getSyncWriter("messages");
writer.begin(); // Start transaction
writer.write({ type: "insert", value: newMessage });
writer.write({ type: "update", value: updatedMessage });
writer.write({ key: "msg_xxx", type: "delete" });
writer.commit(); // Commit transaction → triggers reactivity
```

---

## 2. Optimistic Updates

`src/lib/actions.ts`

The optimistic update pattern lets the UI respond immediately while the server processes the request.

### The Pattern

```
1. Generate opId (unique operation ID)
2. Create the entities (messages, thread updates)
3. Apply to local collections immediately
4. Track rollback entries
5. Dispatch via WebSocket
6. On ack: clean up tracking
7. On reject: rollback to previous state
```

### Rollback Tracking

Each optimistic operation stores rollback entries:

```typescript
type OptimisticEntry = {
  rollback: () => void; // Restores previous state
};

const optimisticByOp = new Map<string, OptimisticEntry[]>();

function trackOptimistic(opId: string, entries: OptimisticEntry[]) {
  optimisticByOp.set(opId, entries);
}
```

A rollback entry can be:

- **Delete row** — if we optimistically inserted a new row, rollback deletes it
- **Restore row** — if we optimistically updated an existing row, rollback restores the original

```typescript
function deleteRow(collectionId: CollectionId, key: string): OptimisticEntry {
  return { rollback: () => applyLocalDelete(collectionId, key) };
}

function restoreRow<T extends { id: string }>(
  collectionId: CollectionId,
  collection: CollectionWithRows,
  row: T,
): OptimisticEntry {
  const snapshot = { ...row };
  return {
    rollback: () => {
      const existing = collection.get(snapshot.id);
      if (existing) {
        applyLocalUpdate(collectionId, snapshot);
      } else {
        applyLocalInsert(collectionId, snapshot);
      }
    },
  };
}
```

### Ack vs Reject

On `ack` (server accepted):

```typescript
export function confirmOp(opId: string) {
  optimisticByOp.delete(opId); // Just clean up — server data is now authoritative
}
```

On `reject` (server rejected):

```typescript
export function rollbackOp(opId: string) {
  const entries = optimisticByOp.get(opId);
  if (!entries) return;
  for (const entry of entries) {
    entry.rollback();
  }
  optimisticByOp.delete(opId);
}
```

### Example: `sendMessageAction`

When the user sends a message:

1. **Create IDs and data** — `createId("op")`, `createMessage("user")`, `createMessage("assistant")`
2. **Optimistic insert** — `applyLocalInsert("messages", userMessage)`, `applyLocalInsert("messages", assistantMessage)`
3. **Track rollback** — two `deleteRow` entries (one for each message)
4. **Dispatch** — `dispatch("create_user_message", payload, { opId })`

If the server accepts, `confirmOp(opId)` cleans up. The server's event will overwrite the optimistic row with the normalized version (same ID, different `opId`).

If the server rejects, `rollbackOp(opId)` deletes both messages. The user sees the messages disappear, and the composer re-enables.

### Anti-Pattern: Letting Optimistic Data Become Stale

If the server sends a `sync_reset` (full snapshot replacement), all optimistic state is lost because the snapshot is authoritative. That's fine — if the server is doing a full reset, there's no point keeping optimistic data.

If the WebSocket reconnects, unacked ops are replayed via `pendingOps.flushAll()`, which re-dispatches them. If the server already processed them (idempotent via opId dedup), it returns the existing ack.

---

## 3. Pending Operations Queue

`src/lib/pending-ops.ts`

The pending ops queue stores operations that have been dispatched but not yet acknowledged:

```typescript
type PendingSyncOp<T extends SyncCommandType = SyncCommandType> = {
  opId: string;
  clientTs: string;
  commandType: T;
  payload: SyncCommandPayloadMap[T];
};
```

### Persistence to localStorage

Ops are persisted so they survive page reloads:

```typescript
const PENDING_OPS_KEY = "b3.pendingOps";

function saveToStorage() {
  const entries = Array.from(pendingOpsMap.values());
  localStorage.setItem(PENDING_OPS_KEY, JSON.stringify(entries));
}

function loadFromStorage() {
  const raw = localStorage.getItem(PENDING_OPS_KEY);
  if (!raw) return;
  const entries = JSON.parse(raw);
  for (const entry of entries) {
    pendingOpsMap.set(entry.opId, entry);
  }
}
```

### Replay on Reconnect

After `hello_ack`, the client replays all unacked ops:

```typescript
export function flushAll() {
  const ops = Array.from(pendingOpsMap.values());
  for (const op of ops) {
    ws.send(
      JSON.stringify({
        type: "command",
        opId: op.opId,
        commandType: op.commandType,
        payload: op.payload,
      }),
    );
  }
}
```

The server deduplicates by opId, so replaying an already-committed op just returns the existing ack.

---

## 4. Draft State

`src/lib/draft-state.ts`

Draft state persists the composer input across page navigations and page loads:

```typescript
type DraftState = {
  text: string;
  modelId: string;
  reasoningLevel: ReasoningLevel;
  search: boolean;
  searchLimit: number;
  attachments: Attachment[];
};

// Per-workspace drafts
const drafts = new Map<string, DraftState>();

// Persisted to localStorage
const DRAFT_KEY = "b3.drafts";
```

The draft is saved on every keystroke (debounced) and restored when the user switches to a workspace:

```typescript
export function saveDraft(workspaceId: string, draft: DraftState) {
  drafts.set(workspaceId, draft);
  localStorage.setItem(DRAFT_KEY, JSON.stringify(Array.from(drafts.entries())));
}

export function loadDraft(workspaceId: string): DraftState | null {
  return drafts.get(workspaceId) ?? null;
}
```

---

## 5. Offline Cache (IndexedDB)

`src/lib/offline-cache.ts`

The IndexedDB cache stores the latest snapshot for instant page-load hydration:

```typescript
const DB_NAME = "shedflare-chat-cache";
const STORE_NAME = "snapshots";
const CACHE_KEY = "latest";

export async function writeCachedSnapshot(tables: SyncTables, lastServerSeq: number) {
  const db = await openDB();
  await db.put(STORE_NAME, {
    key: CACHE_KEY,
    tables,
    lastServerSeq,
    cachedAt: Date.now(),
  });
}

export async function readCachedSnapshot() {
  const db = await openDB();
  const record = await db.get(STORE_NAME, CACHE_KEY);
  return record ? { tables: record.tables, lastServerSeq: record.lastServerSeq } : null;
}
```

### Hydration Flow on Page Load

```
Page loads
  │
  ├── init() in sync-adapter.ts
  │     │
  │     ├── Mark all collections as "ready" (empty) — UI renders skeleton
  │     │
  │     ├── Read IndexedDB cache
  │     │     └── If found: applySnapshot(cached.tables)
  │     │                    setLastServerSeq(cached.lastServerSeq)
  │     │                    → UI renders old data instantly
  │     │
  │     └── Connect WebSocket
  │           │
  │           ├── Send hello { lastServerSeq, unackedOpIds }
  │           │
  │           ├── Server responds with events since lastServerSeq
  │           │     └── Client applies incremental updates
  │           │
  │           └── (If server state is ahead or protocol mismatched)
  │                 └── Server sends sync_reset with full snapshot
  │                       └── Client replaces all collections
  │
  └── UI is up to date
```

### Why Both localStorage and IndexedDB?

- **localStorage** — used for small, frequently-written data: pending ops, draft state, active workspace/thread IDs, last server seq
- **IndexedDB** — used for large, infrequently-written snapshots (the full state can be hundreds of KB)

localStorage is synchronous and simpler for tiny values. IndexedDB handles large structured data without blocking the main thread.

---

## 6. WebSocket Connection Lifecycle

`src/lib/ws-connection.ts`

The WebSocket connection manages:

- **Connection** — creates WebSocket, sends `hello` with clientId, protocolVersion, lastServerSeq, unackedOpIds
- **Reconnection** — exponential backoff on disconnect, re-sends `hello`
- **Message batching** — server may send multiple envelopes in one WebSocket message; these are passed to `processEnvelopes()` as a batch
- **Ping/pong** — keepalive to detect stale connections
- **Server seq tracking** — tracks the last server seq to resume correctly

### Connection States

```
DISCONNECTED → CONNECTING → HELLO_SENT → CONNECTED
                  ↑                              │
                  └────────── DISCONNECTED ←──────┘
                               (on close)
```

On disconnect, the client:

1. Saves pending ops to localStorage (they're already there)
2. Waits with exponential backoff (1s, 2s, 4s, 8s, max 30s)
3. Reconnects, sends `hello` with `lastServerSeq` and `unackedOpIds`
4. Server replays events since `lastServerSeq`
5. Pending ops that weren't acked get replayed

---

## 7. UI State Wires

`src/lib/ui-state.ts`

The UI state module manages which workspace and thread are currently active:

```typescript
// Persisted to localStorage
const ACTIVE_WORKSPACE_KEY = "b3.activeWorkspaceId";
const ACTIVE_THREAD_KEY = "b3.activeThreadId";

let activeWorkspaceId: string | null = loadString(ACTIVE_WORKSPACE_KEY);
let activeThreadId: string | null = loadString(ACTIVE_THREAD_KEY);

export function setActiveWorkspaceId(id: string) {
  activeWorkspaceId = id;
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
}

export function setActiveThreadId(id: string) {
  activeThreadId = id;
  localStorage.setItem(ACTIVE_THREAD_KEY, id);
}
```

After events are processed (or on page load), `ensureActiveSelection()` validates that the active selections still exist:

```typescript
export function ensureActiveSelection(workspaces: Workspace[], threads: Thread[]) {
  // If active workspace was deleted, pick the first one
  if (!workspaces.find((w) => w.id === activeWorkspaceId)) {
    setActiveWorkspaceId(workspaces[0]?.id ?? null);
  }

  // If active thread was deleted, pick the first thread in active workspace
  const wsThreads = threads.filter((t) => t.workspaceId === activeWorkspaceId);
  if (!wsThreads.find((t) => t.id === activeThreadId)) {
    setActiveThreadId(wsThreads[0]?.id ?? null);
  }
}
```

This is called:

- After `processEnvelopes()` processes events (a thread may have been deleted)
- After `rollbackOp()` reverts optimistic changes

---

## 8. Reactive UI Rendering

In `src/routes/index.tsx`, the UI derives view state from collections using SolidJS `createMemo`:

```typescript
// Simplified — the actual UI chains many memos

// Active thread's messages
const threadMessages = createMemo(() => {
  const allMessages = [...messages.state.values()];
  return allMessages
    .filter((m) => m.threadId === activeThreadId())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
});

// Active thread info
const activeThread = createMemo(() => {
  return threads.get(activeThreadId());
});

// Is the assistant currently responding?
const isResponding = createMemo(() => {
  return threadMessages().some((m) => m.role === "assistant" && m.status === "pending");
});
```

When the sync adapter writes to a collection, TanStack DB notifies SolidJS subscribers, which re-run the affected memos and update the DOM.

---

## Summary: Data Flow for a Single Keystroke

```
User types "Hello" in composer
  │
  ├── Draft state: saveDraft("Hello") → localStorage
  │
User presses Enter
  │
  ├── sendMessageAction()
  │     ├── Create optimistic messages (user + assistant)
  │     ├── applyLocalInsert → TanStack DB → UI shows messages instantly
  │     ├── trackOptimistic (for rollback)
  │     └── dispatch → pending-ops (localStorage) → WebSocket
  │
  ├── WebSocket sends to server
  │
  ├── Server processes, broadcasts ack + events
  │     ├── ack → confirmOp() (remove from pending ops)
  │     └── events → sync-adapter → TanStack DB → UI updates
  │
  └── Server sends deltas during streaming
        └── message_delta → sync-adapter → TanStack DB → UI appends text
```
