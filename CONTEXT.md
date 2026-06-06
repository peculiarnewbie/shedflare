# Shedflare Context

Domain language for the Shedflare architecture conversations.

## Sync Protocol Module

A **deep module** extracted from the duplicated sync infrastructure between Chat and Money. Lives in `packages/sync-protocol/`.

### Apps adapted

- **Chat** (`apps/chat`) — `SyncEngineDurableObject extends SyncEngineDO<AppEnv>`. Uses `DataAccess` wrapping shared `DataAccess`, `EventStore` composing shared `SyncEventStore`. Custom `processChatCommand` for assistant turn follow-up logic.
- **Money** (`apps/money`) — `MoneyBudgetDO extends SyncEngineDO<Env>`. Uses `DataAccess` wrapping shared `DataAccess`, `EventStore` composing shared `SyncEventStore` with `Projection` callback. Handler adapters bridge the legacy `(opId, payload, access, eventStore)` signature to the standard `(opId, payload, ctx)`.

### Terms

- **SyncEngineDO** — The Durable Object base class that provides WebSocket lifecycle (hello/handshake, ping/pong, command dispatch), event journaling, event broadcast, and REST routing via Effect HTTP. Apps extend this and fill in abstract members.

- **SyncEventStore** — Owns the `events` table (insert with seq generation) and `commands` table (op_id dedup persistence). Delegates projection to the app-supplied callback. Not the same as the app's full EventStore — the app owns that and composes SyncEventStore into it.

- **HandlerRegistry** — Map from command type string to handler function. Handlers have a standard signature: `(opId, payload) => Effect<{ events, followUp? }, never, DataAccess | SyncEventStore>`. Apps call `registry.set(type, handler)` during registration.

- **DataAccess** — Generic SQL helper effect service (exec, queryOne, queryAll, getEventsAfter, getCommandAck). Used by handlers and projections via `yield*`.

- **Projection** — The app-specific function that mutates materialized domain tables in response to an event. Apps supply this to SyncEventStore. Chat's projection handles workspaces/threads/messages; Money's handles accounts/transactions/categories.

- **SyncClientEnvelope / SyncServerEnvelope** — Shared wire protocol types (hello, command, ack, event, ping/pong, sync_reset). Exact envelope shapes live in the shared package.

### Architectural rules

- Command handlers receive DataAccess and SyncEventStore as Effect services, not constructor arguments.
- Follow-up effects (e.g., chat's assistant turns) are returned from the handler as `Effect<void>`; the base class calls `ctx.waitUntil`.
- REST routes inside the DO are declared via `registerRoutes(router: HttpApp.Default)` and resolved by the base class on non-WebSocket, non-internal requests.
- DDL remains app-side, run in `blockConcurrencyWhile` before any request arrives.
- The protocol types are shared; command type unions and event type unions are app-specific.

## Chat App

### Comparison Threads

- **Comparison Group** — A set of 2-3 threads linked for side-by-side model comparison. Stored in a `comparison_group` join table with `threadIds[]`. The group is the UI-level identity; threads are independent backend entities. Created via a toggle in the composer (new conversations only). Thread type is immutable after creation.

- **Comparison Thread** — A thread that belongs to a comparison group. Runs the full `runAssistantTurn()` pipeline independently per model. Each user message fans out to all models in the group. Tools (search, extract) are called independently per model. Settings (reasoning, search) are uniform across the group.

- **Fork (comparison)** — Each column in a comparison view has a fork button. Forking creates a standalone thread from that model's conversation path. The comparison group stays intact — the original threads are not affected.
