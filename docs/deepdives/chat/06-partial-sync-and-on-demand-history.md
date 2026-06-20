# Partial Sync and On-Demand History

This document proposes a lighter sync model for Shedflare Chat startup: load recent conversation data first, keep live sync reliable, and fetch older thread history only when the owner asks for it.

## Current Behavior

When a client connects with `lastServerSeq: 0`, or when its cursor is stale, the Durable Object sends a `sync_reset` containing a full materialized snapshot.

That snapshot is built by `apps/chat/src/server/data-access.ts#getSnapshot()` and currently includes all rows from:

- `workspaces`
- `account_settings`
- `threads`
- `messages`
- `message_parts`
- `attachments`
- `search_runs`
- `search_results`
- `extract_runs`
- `trace_runs`
- `trace_spans`
- `comparison_groups`

This avoids replaying the entire event log, but it still downloads the entire current database projection to every new or reset client.

That is acceptable while the personal chat database is small. It gets worse as old threads accumulate, especially on mobile or unstable networks where large snapshots can delay first render and increase the chance of reconnect/replay races.

## Goals

- Make new-client startup fast on desktop and mobile.
- Show recent threads and the active workspace quickly.
- Keep live sync semantics correct for new messages and active threads.
- Let older threads be loaded explicitly through pagination or thread open.
- Avoid downloading heavy historical payloads, especially `search_results` and `trace_spans`, unless needed.
- Preserve the single-owner, single-Durable-Object architecture.

## Non-Goals

- Multi-user sync, permissions, or per-user visibility.
- Conflict resolution between independent writers.
- Replacing the existing event-sourced write path.
- Replatforming chat onto another agent/session framework.
- Making every old search/trace artifact instantly searchable offline.

## Design Summary

Split data into two categories:

- **Sync core**: data needed to render the shell, workspace list, recent thread list, active/recent conversations, and live in-progress turns.
- **On-demand detail**: older thread messages, message parts, attachments, search results, extract runs, trace runs, and trace spans.

Initial sync should send a bounded partial snapshot rather than the full projection. The client then fetches older thread summaries and thread details through explicit read endpoints.

Live WebSocket sync continues to deliver events from the server head. The client stores the sync cursor independently from historical loading cursors.

## Proposed Initial Snapshot

For `initial_sync`, return a snapshot containing:

- All `workspaces`.
- `account_settings`.
- All `comparison_groups` that reference included recent threads.
- A page of recent non-archived thread summaries, ordered by `last_message_at DESC`.
- Full detail rows for the selected active thread, if the client can identify one.
- Full detail rows for the most recent `N` threads, where `N` is configurable.
- Any active or non-terminal assistant turn rows, regardless of age.

The snapshot should still include `serverSeq: currentHeadSeq` once it is materialized. That means the client is synced from this point forward, but it does not imply all historical rows are locally loaded.

Recommended default:

- Recent thread summaries: 50.
- Recent full thread details: 10.
- Search result rows: only for detailed threads, and consider trimming previews in a later phase.
- Trace rows: only for detailed threads, or defer entirely until trace drawer open.

## Thread Summary vs Thread Detail

Introduce an explicit distinction in client state.

### Thread Summary

Enough to render the sidebar and thread picker:

- `thread` row.
- Head message metadata, if needed for preview.
- Last message preview fields, either denormalized on `threads` or computed by endpoint.
- Comparison group membership.
- Loaded/detail status metadata.

### Thread Detail

Enough to render the full conversation:

- All messages in the resolved conversation path.
- Message parts for those messages.
- Attachments linked to those messages.
- Search runs/results linked to assistant messages.
- Extract runs linked to assistant messages.
- Trace runs/spans only when needed by the UI.

For first implementation, it is acceptable for thread detail to load all messages in a thread. Later, very large threads can paginate messages inside a thread.

## On-Demand Endpoints

Add read-only endpoints served by the chat Durable Object.

### `GET /api/history/threads`

Returns a page of thread summaries.

Query parameters:

- `workspaceId`: optional, defaults to all workspaces.
- `before`: optional cursor based on `lastMessageAt` and `threadId`.
- `limit`: bounded, default 50, max 100.
- `includeArchived`: optional boolean.

Response:

```ts
type ThreadSummaryPage = {
  serverSeq: number;
  threads: Thread[];
  comparisonGroups: ComparisonGroup[];
  previews: Record<string, ThreadPreview>;
  nextCursor: string | null;
};
```

### `GET /api/history/threads/:threadId`

Returns full conversation detail for a thread.

Query parameters:

- `includeSearch`: default `true` for now.
- `includeTrace`: default `false`.

Response:

```ts
type ThreadDetailSnapshot = {
  serverSeq: number;
  tables: Partial<SyncTables>;
};
```

The response should use the same table-shaped payload as sync snapshots so the client can apply it with the same collection upsert machinery.

### `GET /api/history/messages/:messageId/trace`

Returns trace rows for one assistant message when the trace drawer opens.

Response:

```ts
type MessageTraceSnapshot = {
  serverSeq: number;
  traceRuns: Record<string, TraceRun>;
  traceSpans: Record<string, TraceSpan>;
};
```

## Client State Model

The client currently treats TanStack DB collections as complete. Partial sync requires adding load-state metadata.

Suggested client-only state:

```ts
type ThreadLoadState = {
  threadId: string;
  summaryLoaded: boolean;
  detailLoaded: boolean;
  detailLoading: boolean;
  detailLoadedAtSeq: number | null;
  traceLoadedByMessageId: Record<string, boolean>;
};
```

This should not be persisted as server state. It can live in IndexedDB alongside the offline cache or be recomputed from cached partial snapshots.

UI behavior:

- Sidebar renders loaded summaries.
- Sidebar shows `Load older threads` when `nextCursor` exists.
- Opening an unloaded thread shows a thread-detail skeleton, fetches detail, then applies returned rows.
- Trace drawer fetches traces on first open if missing.
- Search/result panels can show a small loading state if search rows are deferred.

## Live Sync With Partial Local Data

Partial local data creates one important rule: not every incoming event can assume its referenced rows are already loaded.

Recommended handling:

- Events for loaded threads apply normally.
- Events that create or update thread summaries apply normally, so sidebar stays current.
- Events for an unloaded thread should update the thread summary and mark detail as stale or unloaded.
- Terminal assistant events for an unloaded thread should not force-load all detail unless the thread is visible.
- If an event references a missing message in the active thread, fetch thread detail and then replay/apply the event if still relevant.

Because this is a single-owner app, it is acceptable to keep these rules simple and conservative. When in doubt, fetch the thread detail after detecting an event for a visible-but-incomplete thread.

## Cursor Semantics

Keep two cursor concepts separate.

### Sync Cursor

`lastServerSeq` means: all live events up to this sequence have been applied or intentionally accepted by the client sync adapter.

This cursor is used for WebSocket replay.

It must not mean: all historical rows older than this sequence are loaded locally.

### History Cursor

Thread-list pagination uses a separate cursor, such as:

```ts
type ThreadHistoryCursor = {
  lastMessageAt: string;
  threadId: string;
};
```

This cursor is only for older thread summary pages. It must not affect WebSocket replay.

## Server Implementation Plan

1. Add query helpers in `DataAccess`:
   - `getRecentThreadSummaries(limit, workspaceId?)`
   - `getThreadDetailSnapshot(threadId, options)`
   - `getThreadSummaryPage(cursor, limit, workspaceId?)`
   - `getMessageTraceSnapshot(messageId)`
2. Add `getInitialSnapshot(options)` next to `getSnapshot()`.
3. Extend the sync handshake so `hello` can declare client capabilities:
   - `snapshotMode: "full" | "partial"`
   - `activeThreadId?: string`
4. For compatibility during rollout, keep full snapshots as the fallback.
5. Add DO read routes for history endpoints.
6. Update the client sync adapter to accept partial snapshots without clearing unrelated loaded rows unless the reset is explicitly full.

## Client Implementation Plan

1. Add thread load-state tracking.
2. Change initial hydration to support partial snapshots.
3. Add `loadOlderThreads()` action for sidebar pagination.
4. Add `loadThreadDetail(threadId)` action for opening unloaded threads.
5. Add `loadMessageTrace(messageId)` for trace drawer lazy loading.
6. Teach render paths to distinguish missing because unloaded from missing because deleted.
7. Keep IndexedDB cache, but store enough metadata to know which threads are detailed.

## Event Application Rules

The sync adapter should classify events by dependency shape.

### Always Safe

- `workspace_upserted`
- `workspace_archived`
- `account_settings_upserted`
- `thread_upserted`
- `thread_archived`
- `comparison_group_upserted`

### Requires Message Row

- `message_delta`
- `message_completed`
- `message_failed`
- `message_part_appended`
- `search_runs_replaced`
- `search_results_replaced`
- `extract_runs_replaced`

If the required message is missing:

- If the thread is active, fetch thread detail immediately.
- If the thread is not active, mark that thread detail as stale and skip applying heavy detail rows for now.

## Data Volume Priorities

Largest expected contributors:

- `search_results`
- `trace_spans`
- `message_parts` for long reasoning/tool activity streams
- attachments metadata for old imported threads
- completed message text over a long history

Best first wins:

1. Defer `trace_spans` until trace drawer open.
2. Defer old thread details.
3. Page old thread summaries.
4. Consider trimming or lazy-loading `search_results` bodies after thread detail loading works.

## Testing Strategy

Unit tests:

- Initial partial snapshot includes recent threads and excludes old details.
- Thread detail endpoint includes all rows needed to render one thread.
- Thread pagination is stable when multiple threads share `last_message_at`.
- Sync cursor does not change when loading older history pages.
- Events for unloaded threads do not crash the sync adapter.

Integration tests:

- New client starts from partial snapshot, sends a new message, receives completion.
- New client opens an old thread and sees full history.
- Reconnect during partial snapshot does not skip live events.
- Active turn from an old thread is included or recovered correctly.

Manual checks:

- Mobile startup with a large database.
- Bad network reconnect while loading older threads.
- Search-heavy threads with large `search_results` payloads.

## Rollout Plan

1. Add read-only history endpoints while keeping full snapshot startup.
2. Add client actions and UI for loading older thread pages using the endpoints.
3. Defer trace loading behind the trace drawer.
4. Add `snapshotMode: "partial"` handshake support behind a feature flag or local constant.
5. Switch initial sync to partial mode after full snapshot fallback remains tested.
6. Remove or downgrade full snapshot usage only after partial reset behavior is stable.

## Open Questions

- Should initial partial sync include full details for only the active thread, or the last `N` recent threads?
- Should archived threads be excluded by default from initial summaries?
- Should search results be loaded with thread detail or only when expanding search citations?
- Should trace rows be cached after first load or treated as disposable debug data?
- Do comparison groups need special eager-loading so all columns in a comparison view are complete together?

## Recommended First Slice

Implement this in the smallest useful slice:

1. Add `GET /api/history/threads` for paginated older thread summaries.
2. Add `GET /api/history/threads/:threadId` for full thread detail.
3. Add client load-state and a `Load older threads` sidebar button.
4. Keep initial WebSocket snapshot full for this slice.

That gives the UI and API shape for on-demand history without immediately changing reset semantics. Once that works, convert initial sync from full snapshot to partial snapshot.
