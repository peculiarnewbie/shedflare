# Architecture Overview

The chat app is a **single-player AI chat interface** deployed on Cloudflare Workers. It uses a Durable Object (DO) as its single stateful backend, with event sourcing for data integrity and real-time sync to the browser via WebSocket.

## Why a Durable Object?

A DO gives us:

- **A single logical server** that handles all writes, so there is no conflict resolution needed
- **SQLite storage** embedded in the DO — no external database to provision
- **Alarms** for crash recovery (restart interrupted assistant turns)
- **WebSocket** support built into the Workers runtime

The trade-off is that all traffic routes through one DO instance. That is fine for a personal app (one user, maybe a few tabs). If this ever needed to scale to thousands of concurrent users, you'd partition by workspace or user ID.

## File Layout

```
apps/chat/
├── src/
│   ├── worker.ts              # Worker entry — exports DO, wires router
│   ├── app.tsx                # SolidJS app root + Router
│   ├── routes/
│   │   └── index.tsx          # Main chat UI (~2500 lines)
│   ├── api/                   # REST API handlers
│   │   ├── bootstrap.ts       # GET /api/bootstrap
│   │   ├── session.ts         # GET /api/session
│   │   ├── models.ts          # GET /api/models
│   │   ├── sync.ts            # GET /api/sync/* → WS upgrade
│   │   └── uploads-*.ts       # File upload endpoints
│   ├── server/                # Server-side (runs inside DO)
│   │   ├── sync-engine.ts     # Durable Object class
│   │   ├── command-handlers.ts # 20 command handlers
│   │   ├── assistant-turn.ts  # Assistant turn orchestrator
│   │   ├── stream-consumer.ts # AG-UI stream consumer
│   │   ├── event-store.ts     # Event persistence + materialization
│   │   ├── data-access.ts     # Drizzle queries + snapshot builder
│   │   ├── schema.ts          # Raw SQL DDL + migrations
│   │   └── search.ts, extract.ts, title-generator.ts, etc.
│   ├── lib/                   # Client-side state management
│   │   ├── actions.ts         # Optimistic actions (send, retry, edit, fork)
│   │   ├── collections.ts     # TanStack DB collections (11 tables)
│   │   ├── sync-adapter.ts    # Server events → collection mutations
│   │   ├── pending-ops.ts     # Offline op queue (localStorage)
│   │   ├── ws-connection.ts   # WebSocket lifecycle
│   │   ├── draft-state.ts     # Per-workspace draft composer state
│   │   └── offline-cache.ts   # IndexedDB snapshot cache
│   ├── domain/
│   │   └── index.ts           # Effect Schema types, factories, sync protocol
│   └── effect/
│       └── index.ts           # Effect services, tracing, error types
```

## High-Level Data Flow

```
User types message in composer
        │
        ▼
  actions.ts: sendMessageAction()
        │  Creates user + assistant message optimistically
        │  Inserts into local TanStack DB collections (immediate UI)
        │  Dispatches command via WebSocket
        ▼
  ws-connection.ts: sends { type: "command", opId, commandType, payload }
        │
        ▼
  SyncEngineDO.webSocketMessage()
        │
        ▼
  processChatCommand()
        │  Deduplicates (checks opId in commands table)
        │  Validates payload via Effect Schema decodeCommand()
        │  Runs handler inside db.transaction()
        ▼
  handleCreateUserMessage()
        │  Normalizes entities
        │  Calls eventStore.insertEvent() for each change
        │  Returns { events, followUp }
        ▼
  EventStore.insertEvent()
        │  Writes to events table (auto-increment seq)
        │  Applies event to materialized SQLite tables
        ▼
  Broadcast events + ack to WebSocket clients
        │
        ▼
  sync-adapter.ts: processEnvelopes()
        │  Coalesces deltas, batches writes
        │  Applies mutations to TanStack DB collections
        ▼
  SolidJS reactive UI re-renders
```

The follow-up (assistant turn) runs asynchronously:

```
handleCreateUserMessage returns followUp = () => Promise.allSettled([
  generateThreadTitle(),
  runAssistantTurn(),
])

runAssistantTurn()
  ├── Creates TraceContext + TraceRecorder
  ├── Loads thread messages, resolves attachments
  ├── Creates search/extract tools if enabled
  ├── Calls TanStack AI chat() → stream
  └── consumeAssistantStream()
        ├── Broadcasts message_delta events (text chunks)
        ├── Broadcasts message_part_appended (reasoning, activities)
        ├── Broadcasts message_completed / message_failed
        └── Each broadcast → sync-adapter → collection mutation → UI update
```

## Why Event Sourcing Instead of Direct Writes?

Every mutation goes through `EventStore.insertEvent()` which:

1. Writes a row to the `events` table (append-only log)
2. Applies the event to the materialized SQLite tables (the "current state")

This gives us:

- **Full audit trail** — the events table is an append-only log of everything that happened
- **Crash recovery** — if the DO restarts mid-turn, the events are still there, and alarm-based recovery picks up where we left off
- **Snapshot for new clients** — when a client connects, it gets a snapshot of all materialized tables, not the full event log
- **Idempotent rebasing** — the protocol version check wipes state and rebuilds from scratch if the schema changes

Materialized state is updated synchronously (same transaction) so reads always see the latest data. The events table is not replayed on restart — we just keep the materialized tables and use `pending_turns` for the one thing that actually needs recovery (interrupted assistant responses).

## Sync Protocol

The WebSocket protocol (defined in `@shedflare/sync-protocol`) has a few envelope types:

**Client → Server:**

- `hello` — initial handshake (clientId, protocolVersion, lastServerSeq, unackedOpIds)
- `resume` — reconnect without re-syncing everything
- `command` — the actual operation (opId, commandType, payload)
- `ping` — keepalive

**Server → Client:**

- `hello_ack` — confirms protocol version, tells client last server seq
- `ack` — confirms a specific opId was committed
- `reject` — rejects an opId (duplicate, invalid, error)
- `event` — a data change (serverSeq, eventType, payload)
- `sync_reset` — full snapshot replacement (protocol mismatch, error recovery)
- `pong` — keepalive response

The event types are defined in `src/domain/index.ts` as both TypeScript types and Effect Schema schemas:

- `message_upserted`, `message_delta`, `message_completed`, `message_failed`
- `thread_upserted`, `thread_archived`, `thread_deleted`
- `workspace_upserted`, `workspace_archived`
- `attachment_upserted`, `attachment_deleted`
- `search_runs_replaced`, `search_results_replaced`
- `extract_runs_replaced`
- `trace_run_upserted`, `trace_span_upserted`
- `account_settings_upserted`
- `server_state_rebased`

## Stack Choices

| Layer                | Choice                             | Why not alternatives                                                                                                |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **AI SDK**           | TanStack AI (`@tanstack/ai`)       | Vercel AI SDK is tied to Next.js conventions; TanStack AI is framework-agnostic and works directly with Workers     |
| **State management** | TanStack DB (reactive collections) | No Redux/Zustand needed — TanStack DB collections are reactive key-value stores that integrate with SolidJS signals |
| **Validation**       | Effect Schema                      | Zod would work fine, but Effect Schema integrates with the Effect ecosystem for dependency injection and tracing    |
| **ORM**              | Drizzle                            | Kysely is lighter but Drizzle's type inference saves boilerplate; raw SQL for complex queries                       |
| **Streaming**        | AG-UI over SSE                     | Standard SSE from the go-bridge; no WebSocket-level streaming                                                       |
| **UI**               | SolidJS                            | React would add overhead; SolidJS signals map cleanly to TanStack DB reactivity                                     |
| **Testing**          | Vitest (via Vite+)                 | Standard choice for Vite projects                                                                                   |
| **Linting**          | Oxlint (via Vite+)                 | Faster than ESLint                                                                                                  |
