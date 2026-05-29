# Authoring Route: How a Message Gets Sent

This document traces the full path of a user message, from pressing Enter in the composer to seeing the AI response stream in. It covers all three message-creation paths: **send**, **retry**, and **edit**.

---

## 1. The Composer (Client)

In `src/routes/index.tsx`, there is a composer area (the text input at the bottom of the chat). On submit, it calls `sendMessageAction()`:

```typescript
// From the UI (simplified):
sendMessageAction({
  thread: currentThread,
  text: "What is the capital of France?",
  modelId: "gpt-4",
  reasoningLevel: "off",
  search: false,
  attachmentIds: [],
});
```

---

## 2. `sendMessageAction()` — Optimistic Update + Dispatch

`src/lib/actions.ts:372`

```typescript
export function sendMessageAction(input: { thread, text, modelId, reasoningLevel, search, ... }) {
  const opId = createId("op");          // Unique operation ID
  const updatedAt = nowIso();

  // Create the user message (status: "completed")
  const userMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: input.thread.headMessageId ?? null,
    role: "user",
    modelId: input.modelId,
    text: input.text,
    status: "completed",
  });

  // Create the assistant message (status: "pending", no text yet)
  const assistantMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: userMessage.id,
    role: "assistant",
    modelId: input.modelId,
    text: "",
    status: "pending",
  });

  // Update the thread head to point to the new assistant message
  const threadUpdate: Thread = {
    ...input.thread,
    headMessageId: assistantMessage.id,
    modelId: input.modelId,
    updatedAt,
    lastMessageAt: updatedAt,
  };

  // --- OPTIMISTIC MUTATIONS ---
  // Immediately insert into local collections so the UI shows the message
  applyLocalUpdate("threads", toLocalSyncRow(threadUpdate, opId));
  applyLocalInsert("messages", toLocalSyncRow(userMessage, opId));
  applyLocalInsert("messages", toLocalSyncRow(assistantMessage, opId));

  // Track rollback in case server rejects
  const rollbackEntries = [
    restoreRow("threads", threads, existingThread),
    deleteRow("messages", userMessage.id),
    deleteRow("messages", assistantMessage.id),
  ];
  trackOptimistic(opId, rollbackEntries);

  // --- DISPATCH ---
  dispatch("create_user_message",
    {
      threadId: input.thread.id,
      thread: toWire(threadUpdate, opId),
      userMessage: toWire(userMessage, opId),
      assistantMessage: toWire(assistantMessage, opId),
      promptText: input.text,
      modelId: input.modelId,
      reasoningLevel: input.reasoningLevel,
      search: input.search,
      searchLimit: input.searchLimit,
      attachmentIds: input.attachmentIds ?? [],
    },
    { opId },
  );
}
```

### Key Design Decisions

**Why create both messages client-side?**
The client owns IDs. This lets us optimistically render both messages immediately without waiting for the server. If the server rejects, we roll them back. If the server accepts, it overwrites with its own normalized version (same IDs, server-owned fields like `opId`).

**Why `status: "pending"` for the assistant message?**
The assistant message starts in "pending" state. The UI shows a loading indicator for pending messages. When the first stream delta arrives, the status transitions to "streaming". On completion, it becomes "completed".

**What happens if the server has already seen this `opId`?**
`processChatCommand()` checks `this.access.getCommandAck(opId)` and returns the existing ack without re-executing. This is idempotency — the server can receive the same command twice (e.g., if the client reconnects and replays pending ops) without creating duplicate messages.

---

## 3. `dispatch()` — Pending Ops + WebSocket

`src/lib/pending-ops.ts:71`

```typescript
export function dispatch<T extends SyncCommandType>(
  commandType: T,
  payload: SyncCommandPayloadMap[T],
  options: { opId: string },
) {
  const op = {
    opId: options.opId,
    clientTs: nowIso(),
    commandType,
    payload,
  };

  // Store in pending ops map (persists to localStorage for reconnect safety)
  pendingOps.set(options.opId, op);

  // Send via WebSocket
  ws.send(JSON.stringify({
    type: "command",
    opId: options.opId,
    clientTs: op.clientTs,
    commandType,
    payload,
  }));
}
```

The pending ops queue (`src/lib/pending-ops.ts`) serves multiple purposes:
- **Persistence to localStorage** — if the page reloads before the server acks, the op is replayed on reconnect
- **Tracking** — the op stays in `pendingOps` until an `ack` or `reject` arrives from the server
- **Replay** — on `hello_ack`, `flushAll()` replays any unacked ops

### What Happens If the WebSocket Disconnects?

`ws-connection.ts` handles reconnection with exponential backoff. When it reconnects:
1. It sends a `hello` with `unackedOpIds` (list of ops that were dispatched but not yet acknowledged)
2. The server checks each opId against its `commands` table
3. Already-committed ops get re-acked (no duplicate work)
4. Unknown ops get processed normally

---

## 4. Server Receives the Command

`src/server/sync-engine.ts:207`

```typescript
async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
  // ...
  switch (envelope.type) {
    case "command":
      await this.processChatCommand(
        envelope.opId,
        envelope.commandType,
        envelope.payload,
        true,  // doBroadcast
      );
      break;
  }
}
```

---

## 5. `processChatCommand()` — The Central Command Pipeline

`src/server/sync-engine.ts:291`

This is the heart of the server. Every command flows through this method:

```typescript
private async processChatCommand<T extends SyncCommandType>(
  opId: string,
  commandType: T,
  payload: SyncCommandPayloadMap[T],
  doBroadcast: boolean,
): Promise<SyncCommandResult> {
  // STEP 1: Deduplicate
  const existing = this.access.getCommandAck(opId);
  if (existing) {
    return { ack: existing as SyncServerAck, events: [] };
  }

  // STEP 2: Validate payload with Effect Schema
  const validatedPayload = decodeCommand(commandType, payload);

  // STEP 3: Run handler in SQLite transaction
  const transactionResult = this.db.transaction(() => {
    const result = handler(opId, validatedPayload, handlerContext);

    // Record the ack in the commands table
    const ack: SyncServerAck = { type: "ack", opId, serverSeq: ackedSeq, ... };
    this.db.insert(dbSchema.commands).values({ opId, type: commandType, status: "accepted", ... }).run();

    return { ack, events: result.events, followUp: result.followUp };
  });

  // STEP 4: Broadcast ack + events to all WebSocket clients
  if (doBroadcast) {
    this.broadcast(transactionResult.ack);
    for (const event of transactionResult.events) {
      this.broadcast(event);
    }
  }

  // STEP 5: Handle follow-up (assistant turn)
  const followUpPromise = transactionResult.followUp?.();
  if (followUpPromise && isTurnCommand(commandType)) {
    // Save turn parameters to pending_turns table (crash recovery)
    this.saveTurnParams(turnMessageId, { ... });
    this.activeTurnMessageIds.add(turnMessageId);

    // Set alarm (if DO restarts, alarm fires to recover)
    void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);

    // Run follow-up, then clear turn params
    followUpPromise.then(() => {
      this.activeTurnMessageIds.delete(turnMessageId);
      this.clearTurnParams(turnMessageId);
    });

    // Keep the DO alive until follow-up completes
    this.ctx.waitUntil(followUpPromise);
  }

  return { ack, events, followUp: followUpPromise };
}
```

### Why a Transaction?

The handler and ack recording happen in the same SQLite transaction. Either both succeed or both fail. This guarantees we never broadcast events without recording the ack, and vice versa.

### Why `followUp` Is a Deferred Function, Not a Promise

```typescript
const followUp: DeferredFollowUp = () =>
  Promise.allSettled([
    ctx.generateThreadTitle({ ... }),
    ctx.runAssistantTurn({ ... }),
  ]).then(() => undefined);
```

The follow-up is wrapped in a function (`DeferredFollowUp = () => Promise<void>`) so it can be called **after** the transaction commits. If we called it inside the transaction, the transaction would hold a lock while the assistant turn runs (potentially 30+ seconds). By deferring, the transaction completes quickly and the long-running work happens asynchronously.

---

## 6. `handleCreateUserMessage()` — The Command Handler

`src/server/command-handlers.ts:271`

```typescript
export function handleCreateUserMessage(
  opId: string,
  payload: CreateUserMessagePayload,
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  // Normalize entities (strips optimistic fields, ensures defaults)
  const normalizedThread = normalizeThread(payload.thread, opId);
  const userMessage = normalizeMessage({ ...payload.userMessage, status: "completed" }, opId);
  const assistantMessage = normalizeMessage(
    { ...payload.assistantMessage, status: "pending", text: "" },
    opId,
  );

  // Generate events
  const events: SyncServerEvent[] = [
    ctx.eventStore.insertEvent(opId, "thread_upserted", { row: normalizedThread }),
    ctx.eventStore.insertEvent(opId, "message_upserted", { row: userMessage }),
    ctx.eventStore.insertEvent(opId, "message_upserted", { row: assistantMessage }),
  ];

  // Link attachments to the user message
  if (payload.attachmentIds?.length) {
    for (const attId of payload.attachmentIds) {
      const attRow = ctx.access.getAttachment(attId);
      if (attRow) {
        events.push(
          ctx.eventStore.insertEvent(opId, "attachment_upserted", {
            row: normalizeAttachment({ ...attRow, messageId: userMessage.id }, opId),
          }),
        );
      }
    }
  }

  // Schedule follow-up work
  const followUp: DeferredFollowUp = () =>
    Promise.allSettled([
      ctx.generateThreadTitle({ threadId, promptText, chatModelId, chatModelInterleavedField }),
      ctx.runAssistantTurn({ ...payload, thread: normalizedThread, userMessage, assistantMessage }),
    ]).then(() => undefined);

  return { events, followUp };
}
```

### The `normalize*` Functions

Each `normalize*` function strips optimistic wire fields and applies defaults:

```typescript
export function normalizeMessage(row: Message, opId: string) {
  return decodeMessageRow({
    ...row,
    parentMessageId: row.parentMessageId ?? null,
    sourceMessageId: row.sourceMessageId ?? null,
    reasoningLevel: row.reasoningLevel ?? "off",
    optimistic: false,        // Server strips optimistic flag
    opId,                     // Server assigns its own opId
    updatedAt: row.updatedAt || nowIso(),
  });
}
```

This is important because the client sends `optimistic: true` in wire payloads. The server normalizes to `optimistic: false` and assigns its own `opId`.

---

## 7. `EventStore.insertEvent()` — Writing Events

`src/server/event-store.ts:33`

```typescript
insertEvent<T extends SyncEventType>(
  opId: string | null,
  eventType: T,
  payload: SyncEventPayloadMap[T],
): SyncServerEvent<T> {
  const event = this.syncEventStore.insertEvent(opId, eventType, payload);
  // ^^ This:
  //    1. Writes to the events table (append-only log)
  //    2. Calls applyEventToMaterializedState() to update SQLite tables
  return event as SyncServerEvent<T>;
}
```

The event returned has a `serverSeq` (auto-incrementing sequence number) and `eventId` (unique). This is what gets broadcast to clients.

See the [Event Sourcing deepdive](./04-event-sourcing.md) for the full details of how events flow through the system.

---

## 8. `runAssistantTurn()` — The Assistant Turn

`src/server/assistant-turn.ts:84`

After the events are committed and broadcast, `processChatCommand()` calls `followUp?.()` which runs `runAssistantTurn()`:

```typescript
export async function runAssistantTurn(payload: AssistantTurnPayload, ctx: AssistantTurnContext) {
  const abortController = new AbortController();
  ctx.assistantTurnControllers.set(payload.assistantMessage.id, abortController);

  try {
    // Setup tracing
    const traceContext = makeRootTraceContext({ messageId, threadId, modelId, opId });
    const recorder = makeTraceRecorder({ ... });

    // Load thread messages + build model messages (with resolved attachments)
    const threadMessages = await traceSync("assistant.thread_messages.load", "sync", {},
      () => ctx.access.getThreadMessages(thread, [payload.userMessage, payload.assistantMessage]),
    );

    // Create tools (search, browser extract) if enabled
    const searchTool = payload.search ? createExaSearchTool({ ... }) : null;
    const extractTool = payload.search && ctx.env.BROWSER ? createBrowserExtractTool({ ... }) : null;

    // Build the messages for the AI provider
    const { messages: modelMessages, systemPrompts } = await buildModelMessages(
      workspace.id, threadMessages, ctx.access, ctx.env,
    );

    // Create the chat adapter + call TanStack AI
    const adapter = createChatCompletionsAdapter({ baseUrl, apiKey, trace }, modelId);
    const stream = chat({ adapter, messages, systemPrompts, agentLoopStrategy, tools, signal });

    // Consume the stream — this broadcasts deltas, reasoning, completion events
    const result = await consumeAssistantStream(stream, consumerDeps);
    // ...
  } finally {
    ctx.assistantTurnControllers.delete(payload.assistantMessage.id);
  }
}
```

### `buildModelMessages()` — Building the Conversation

`src/server/data-access.ts:433`

This function reconstructs the conversation the model will see:

```typescript
export async function buildModelMessages(workspaceId, threadMessages, access, env) {
  const systemPrompts: string[] = [];
  if (workspace?.systemPrompt) {
    systemPrompts.push(workspace.systemPrompt);
  }

  const messages: ModelMessage[] = [];

  for (const message of threadMessages) {
    if (message.status === "failed" || message.status === "cancelled") continue;

    const contentParts = [];

    if (message.text?.trim()) {
      contentParts.push(message.text);
    }

    if (message.role === "user") {
      // Resolve attachments: images get signed URLs, text gets inlined
      for (const attachment of attachmentsForThisMessage) {
        if (isImageAttachment(attachment.mimeType)) {
          const signedUrl = await getSignedAttachmentUrl(env, attachment.objectKey);
          contentParts.push({ type: "image", source: { type: "url", value: signedUrl } });
        }
        if (isInlineTextAttachment(attachment.mimeType, attachment.sizeBytes)) {
          const text = await completeTextAttachment(env, attachment.objectKey);
          contentParts.push(`Attachment ${attachment.fileName}:\n${text}`);
        }
      }
    }

    messages.push({ role: message.role, content: contentParts });
  }

  return { messages, systemPrompts };
}
```

### `consumeAssistantStream()` — Processing the AI Stream

`src/server/stream-consumer.ts:104`

This is the streaming engine. It consumes TanStack AI's AG-UI stream events and translates them to our event system:

```
TEXT_MESSAGE_START → (noop)
TEXT_MESSAGE_CONTENT → accumulate delta, flush at threshold → message_delta event
CUSTOM (reasoning) → accumulate reasoning delta → message_part_appended (reasoning)
TOOL_CALL_START → flush reasoning, log
TOOL_CALL_END → track tool completion
RUN_FINISHED → flush final delta → message_completed event
RUN_ERROR → message_failed event
```

Key behavior:
- **Delta batching**: Text deltas are batched up to 96 characters before broadcasting. This reduces the number of `message_delta` events and prevents the UI from re-rendering on every token.
- **Reasoning interleaving**: Reasoning content (from models that emit thinking/reasoning) is flushed to `message_part_appended` parts immediately, preserving seq order with text parts.
- **Tool call tracking**: Each tool call iteration is tracked and logged for observability.
- **Activity reporting**: Progress events (searching, extracting, streaming) are broadcast as `message_part_appended` with kind `"activity"`.

### How Stream Events Map to Client Updates

| Server event | Client effect |
|---|---|
| `message_delta` | Appends text to the message, sets status to `"streaming"` |
| `message_part_appended` (reasoning) | Shows a collapsible "Reasoning" chip |
| `message_part_appended` (activity) | Shows a progress chip (e.g., "Searching...") |
| `message_completed` | Sets status to `"completed"`, shows token metrics |
| `message_failed` | Sets status to `"failed"`, shows error message |

---

## 9. Retry Path

`retryMessageAction()` (`src/lib/actions.ts:470`) is simpler than send:

```typescript
export function retryMessageAction(input) {
  // Only creates a new assistant message
  // Reuses the existing user message
  const assistantMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: input.userMessage.id,
    role: "assistant",
    status: "pending",
    text: "",
    // ...
  });

  // Optimistic update + dispatch
  dispatch("retry_message", {
    threadId: input.thread.id,
    userMessage: toWire(input.userMessage, opId),
    assistantMessage: toWire(assistantMessage, opId),
    // ...
  }, { opId });
}
```

On the server, `handleRetryMessage()` (`src/server/command-handlers.ts:317`):
1. Looks up the existing user message by ID
2. Creates only the assistant message event (`message_upserted`)
3. Updates the thread head
4. Schedules `runAssistantTurn`

**Why does retry use the existing user message?** Because the user's original text hasn't changed — only the assistant response is being regenerated. This keeps the conversation tree intact and preserves attachment links.

---

## 10. Edit Path

`editUserMessageAction()` (`src/lib/actions.ts:534`) is the most complex because it creates an entirely new branch:

```typescript
export function editUserMessageAction(input) {
  // Creates a NEW user message (with sourceMessageId pointing to original)
  const userMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: input.sourceMessage.parentMessageId,  // Same parent as the edited message
    sourceMessageId: input.sourceMessage.id,               // Points to what was edited
    role: "user",
    text: input.text,                                       // New text
    status: "completed",
  });

  // Creates a new assistant message as the child
  const assistantMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: userMessage.id,
    role: "assistant",
    status: "pending",
    text: "",
  });

  // Clones attachments from the original message
  const clonedAttachments = input.attachmentIds.map((id) => {
    const existing = attachments.get(id);
    return createAttachment({
      threadId: input.thread.id,
      messageId: userMessage.id,
      objectKey: existing.objectKey,
      // ... clone with same content, new ID
    });
  });

  // Optimistic update + dispatch
  dispatch("edit_user_message", {
    sourceMessageId: input.sourceMessage.id,
    userMessage: toWire(userMessage, opId),
    assistantMessage: toWire(assistantMessage, opId),
    attachments: clonedAttachments.map(a => toWire(a, opId)),
    // ...
  }, { opId });
}
```

On the server, `handleEditUserMessage()` creates:
1. `thread_upserted` — updates head to new assistant message
2. `message_upserted` — the new user message
3. `message_upserted` — the new assistant message
4. `attachment_upserted` × N — cloned attachments

**Why create new messages instead of updating the old ones?**
Editing does not destroy the original messages. They remain in the database, linked by `sourceMessageId`. This enables the fork visualization and preserves history. The thread's `headMessageId` just points to the new branch tip.

---

## 11. Crash Recovery via Alarms

`src/server/sync-engine.ts:243`

If the DO restarts while an assistant turn is running (e.g., the DO evicts due to inactivity), the alarm mechanism recovers it:

```typescript
async alarm() {
  const turns = this.loadAllTurnParams();  // Reads pending_turns table

  for (const [messageId, params] of turns) {
    if (this.activeTurnMessageIds.has(messageId)) {
      // Turn is still running — reschedule alarm
      void this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      continue;
    }

    const message = this.chatAccess.getMessage(messageId);
    if (!message || message.status === "completed" || message.status === "failed") {
      // Turn was completed before restart — clean up
      this.clearTurnParams(messageId);
      continue;
    }

    // Recovery: fail the old message, create a new one, restart the turn
    await this.recoverTurn(messageId, params);
  }
}
```

Recovery steps in `recoverTurn()`:
1. Create a new assistant message (with fresh ID)
2. Save new turn params
3. Broadcast `message_failed` for the stale message (error: `"interrupted"`)
4. Broadcast `thread_upserted` (updating `headMessageId` to new message)
5. Broadcast `message_upserted` for the new message
6. Call `runAssistantTurn()` with the original parameters

This means the user sees:
- The original pending message marked as "interrupted"
- A new pending message appearing
- The assistant turn restarting from scratch

The alarm fires every 30 seconds as long as there are pending turns. The `activeTurnMessageIds` set tracks turns that are currently running in this DO instance, so we don't double-recover.

---

## Flow Summary (Send Path)

```
Composer (Enter)
  │
  ▼
sendMessageAction()
  ├── createMessage("user", text, status: "completed")
  ├── createMessage("assistant", "", status: "pending")
  ├── Optimistic: insert into local TanStack DB collections
  └── dispatch("create_user_message", payload, { opId })
        │
        ▼
pending-ops.ts: store op in localStorage, send via WebSocket
        │
        ▼
SyncEngineDO.webSocketMessage()
        │
        ▼
processChatCommand()
  ├── Dedup check (getCommandAck)
  ├── Validate payload (Effect Schema decodeCommand)
  ├── db.transaction()
  │   ├── handleCreateUserMessage()
  │   │   ├── normalizeThread, normalizeMessage × 2
  │   │   ├── eventStore.insertEvent("thread_upserted")
  │   │   ├── eventStore.insertEvent("message_upserted" × 2)
  │   │   └── return { events, followUp }
  │   ├── Insert ack into commands table
  │   └── return { ack, events, followUp }
  ├── Broadcast ack + events to WebSocket clients
  ├── Save turn params (crash recovery)
  ├── Set alarm
  ├── ctx.waitUntil(followUpPromise)
  │     │
  │     ▼
  │   runAssistantTurn()
  │     ├── Trace setup
  │     ├── Load thread messages
  │     ├── buildModelMessages() (resolve attachments)
  │     ├── Create search/extract tools
  │     ├── chat() → stream
  │     └── consumeAssistantStream()
  │           ├── message_delta × N (text chunks)
  │           ├── message_part_appended × N (reasoning, activities)
  │           └── message_completed / message_failed
  │
  ▼ (in parallel)
Client sync-adapter.ts processes events
  ├── ack → confirmOp() (remove from pending ops)
  ├── message_delta → append text, set streaming
  ├── message_part_appended → insert part
  └── message_completed → set fields, mark completed
```
