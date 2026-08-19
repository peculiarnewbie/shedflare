import {
  createAttachment,
  createComparisonGroup,
  createId,
  createMessage,
  createThread,
  createWorkspace,
  nowIso,
  resolveThreadMessagePath,
  toWire,
  type AccountSettings,
  type Attachment,
  type CancelAssistantTurnPayload,
  type CreateComparisonPayload,
  type CreateUserMessagePayload,
  type EditUserMessagePayload,
  type ForkThreadPayload,
  type Message,
  type ReasoningLevel,
  type RetryMessagePayload,
  type Thread,
  type Workspace,
} from "#/domain";
import { dispatch } from "./pending-ops";
import {
  workspaces,
  accountSettings,
  threads,
  messages,
  attachments,
  applyLocalDelete,
  applyLocalInsert,
  applyLocalUpdate,
  type CollectionId,
} from "./collections";
import { clearAllDraftState, clearWorkspaceDraft } from "./draft-state";
import { setActiveWorkspaceId, setActiveThreadId, ensureActiveSelection } from "./ui-state";
import { debugLog } from "./client-debug";

// ---------------------------------------------------------------------------
// Optimistic rollback tracking
// ---------------------------------------------------------------------------

type OptimisticEntry = {
  rollback: () => void;
};

type CollectionWithRows = {
  get: (key: string) => any;
};

const optimisticByOp = new Map<string, OptimisticEntry[]>();

function toLocalSyncRow<T extends object>(row: T, opId: string) {
  return {
    ...row,
    optimistic: false as const,
    opId,
  };
}

function trackOptimistic(opId: string, entries: OptimisticEntry[]) {
  optimisticByOp.set(opId, entries);
}

function deleteRow(collectionId: CollectionId, key: string): OptimisticEntry {
  return {
    rollback: () => {
      applyLocalDelete(collectionId, key);
    },
  };
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
        return;
      }
      applyLocalInsert(collectionId, snapshot);
    },
  };
}

/**
 * Called by sync-adapter on reject — removes optimistic rows.
 */
export function rollbackOp(opId: string) {
  const entries = optimisticByOp.get(opId);
  if (!entries) return;
  for (const entry of entries) {
    try {
      entry.rollback();
    } catch (e) {
      console.warn(
        "[actions] rollback failed for op",
        opId,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  optimisticByOp.delete(opId);
  // Re-validate selection
  ensureActiveSelection([...workspaces.state.values()], [...threads.state.values()]);
}

/** Clean up tracking when server ack confirms the optimistic data. */
export function confirmOp(opId: string) {
  optimisticByOp.delete(opId);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function createWorkspaceAction(
  name: string,
  input: {
    defaultModelId: string;
    defaultReasoningLevel?: ReasoningLevel;
    defaultSearchMode?: boolean;
    defaultSearchLimit?: number;
  },
) {
  const opId = createId("op");
  const workspace = createWorkspace({
    name,
    defaultModelId: input.defaultModelId,
    defaultReasoningLevel: input.defaultReasoningLevel,
    defaultSearchMode: input.defaultSearchMode,
    defaultSearchLimit: input.defaultSearchLimit,
  });
  const initialThread = createThread({ workspaceId: workspace.id });

  // Optimistic
  applyLocalInsert("workspaces", toLocalSyncRow(workspace, opId));
  applyLocalInsert("threads", toLocalSyncRow(initialThread, opId));
  setActiveWorkspaceId(workspace.id);
  setActiveThreadId(initialThread.id);
  trackOptimistic(opId, [
    deleteRow("workspaces", workspace.id),
    deleteRow("threads", initialThread.id),
  ]);

  dispatch(
    "create_workspace",
    {
      workspace: toWire(workspace, opId),
      initialThread: toWire(initialThread, opId),
    },
    { opId },
  );
}

export function createThreadAction(workspaceId: string) {
  const opId = createId("op");
  const thread = createThread({ workspaceId });

  applyLocalInsert("threads", toLocalSyncRow(thread, opId));
  setActiveThreadId(thread.id);
  trackOptimistic(opId, [deleteRow("threads", thread.id)]);

  dispatch("create_thread", { thread: toWire(thread, opId) }, { opId });
}

export function createComparisonAction(input: {
  workspace: Workspace;
  text: string;
  modelIds: string[];
  modelInterleavedFields: (string | null | undefined)[];
  reasoningLevel: ReasoningLevel;
  search: boolean;
  searchLimit?: number;
  preferFreeSearch?: boolean;
  attachmentIds?: string[];
}) {
  const opId = createId("op");

  // Create comparison group
  const comparisonGroup = createComparisonGroup({
    workspaceId: input.workspace.id,
    threadIds: [], // Will be filled below
  });

  // Create one thread per model
  const comparisonThreads: Thread[] = [];
  for (let i = 0; i < input.modelIds.length; i++) {
    const thread = createThread({
      workspaceId: input.workspace.id,
      title: "New Chat",
      modelId: input.modelIds[i],
      reasoningLevel: input.reasoningLevel,
      searchEnabled: input.search,
      searchLimit: input.searchLimit,
      threadType: "comparison",
      comparisonGroupId: comparisonGroup.id,
    });
    comparisonThreads.push(thread);
  }

  // Update comparison group with actual thread IDs
  const updatedComparisonGroup = {
    ...comparisonGroup,
    threadIds: JSON.stringify(comparisonThreads.map((t) => t.id)),
  };

  // Create user messages and assistant messages per thread
  const userMessages: Message[] = [];
  const assistantMessages: Message[] = [];
  for (let i = 0; i < comparisonThreads.length; i++) {
    const thread = comparisonThreads[i];
    const userMessage = createMessage({
      threadId: thread.id,
      parentMessageId: null,
      role: "user",
      modelId: input.modelIds[i],
      reasoningLevel: input.reasoningLevel,
      text: input.text,
      searchEnabled: input.search,
      status: "completed",
    });
    const assistantMessage = createMessage({
      threadId: thread.id,
      parentMessageId: userMessage.id,
      role: "assistant",
      modelId: input.modelIds[i],
      reasoningLevel: input.reasoningLevel,
      text: "",
      searchEnabled: input.search,
      status: "pending",
    });
    // Update thread headMessageId
    thread.headMessageId = assistantMessage.id;
    userMessages.push(userMessage);
    assistantMessages.push(assistantMessage);
  }

  // Optimistic mutations
  applyLocalInsert("comparisonGroups", toLocalSyncRow(updatedComparisonGroup, opId));
  for (const thread of comparisonThreads) {
    applyLocalInsert("threads", toLocalSyncRow(thread, opId));
  }
  for (const msg of [...userMessages, ...assistantMessages]) {
    applyLocalInsert("messages", toLocalSyncRow(msg, opId));
  }

  const rollbackEntries: OptimisticEntry[] = [
    deleteRow("comparisonGroups", updatedComparisonGroup.id),
    ...comparisonThreads.map((t) => deleteRow("threads", t.id)),
    ...userMessages.map((m) => deleteRow("messages", m.id)),
    ...assistantMessages.map((m) => deleteRow("messages", m.id)),
  ];

  // Link attachments to user messages
  for (const attachmentId of input.attachmentIds ?? []) {
    for (const userMessage of userMessages) {
      const existing = attachments.get(attachmentId);
      if (!existing) continue;
      rollbackEntries.push(restoreRow("attachments", attachments, existing));
      applyLocalUpdate("attachments", {
        ...existing,
        messageId: userMessage.id,
        status: "ready",
        optimistic: false,
        opId,
      });
    }
  }

  trackOptimistic(opId, rollbackEntries);

  // Navigate to first thread
  setActiveThreadId(comparisonThreads[0].id);

  dispatch(
    "create_comparison",
    {
      comparisonGroup: toWire(updatedComparisonGroup, opId),
      threads: comparisonThreads.map((t) => toWire(t, opId)),
      userMessages: userMessages.map((m) => toWire(m, opId)),
      assistantMessages: assistantMessages.map((m) => toWire(m, opId)),
      promptText: input.text,
      modelIds: input.modelIds,
      modelInterleavedFields: input.modelInterleavedFields,
      reasoningLevel: input.reasoningLevel,
      search: input.search,
      searchLimit: input.searchLimit,
      preferFreeSearch: input.preferFreeSearch,
      attachmentIds: input.attachmentIds ?? [],
    } satisfies CreateComparisonPayload,
    { opId },
  );
}

export function deleteThreadAction(threadId: string) {
  const opId = createId("op");
  applyLocalDelete("threads", threadId);
  // Also optimistically remove messages belonging to this thread
  for (const [key, message] of messages.state.entries()) {
    if (message.threadId === threadId) {
      applyLocalDelete("messages", key);
    }
  }
  dispatch("delete_thread", { id: threadId }, { opId });
  ensureActiveSelection([...workspaces.state.values()], [...threads.state.values()]);
}

export function forkThreadAction(input: {
  sourceThreadId: string;
  sourceMessageId: string;
  workspaceId: string;
}) {
  const opId = createId("op");

  // Walk message path from fork point back to root
  const allMessages = [...messages.state.values()];
  const threadMessages = allMessages.filter((m) => m.threadId === input.sourceThreadId);
  const sourceThread = threads.get(input.sourceThreadId);
  const path = resolveThreadMessagePath(threadMessages, sourceThread?.headMessageId ?? null);

  // Find the fork index — we copy everything up to and including sourceMessageId
  const forkIndex = path.findIndex((m) => m.id === input.sourceMessageId);
  if (forkIndex === -1) return;

  const messagesToCopy = path.slice(0, forkIndex + 1);
  const originalIds = new Set(messagesToCopy.map((m) => m.id));

  // Create new thread with fork tracking
  const newThread = {
    ...createThread({
      workspaceId: input.workspaceId,
      title: sourceThread?.title ?? "Forked Chat",
      modelId: sourceThread?.modelId ?? null,
      reasoningLevel: sourceThread?.reasoningLevel ?? null,
      searchEnabled: sourceThread?.searchEnabled ?? null,
      searchLimit: sourceThread?.searchLimit ?? null,
      forkedFromThreadId: input.sourceThreadId,
      forkedFromMessageId: input.sourceMessageId,
    }),
    optimistic: false as const,
    opId,
  };

  // Map old message IDs to new message objects (preserving order)
  const copiedMessages: Message[] = [];
  const originalToNewId = new Map<string, string>();
  let lastNewMessageId: string | null = null;

  for (const original of messagesToCopy) {
    const newMessage: Message = {
      ...createMessage({
        threadId: newThread.id,
        parentMessageId: lastNewMessageId,
        sourceMessageId: original.id,
        role: original.role,
        modelId: original.modelId,
        reasoningLevel: original.reasoningLevel,
        text: original.text,
        searchEnabled: original.searchEnabled,
      }),
      status: "completed" as const,
      optimistic: false as const,
      opId,
    };
    copiedMessages.push(newMessage);
    originalToNewId.set(original.id, newMessage.id);
    lastNewMessageId = newMessage.id;
  }

  // Set headMessageId to the last copied message (the fork point)
  if (lastNewMessageId) {
    newThread.headMessageId = lastNewMessageId;
  }

  // Clone attachments belonging to the copied messages
  const allAttachments = [...attachments.state.values()];
  const sourceAttachments = allAttachments.filter(
    (a) => a.threadId === input.sourceThreadId && a.messageId && originalIds.has(a.messageId),
  );
  const copiedAttachments: Attachment[] = [];

  for (const original of sourceAttachments) {
    const newMessageId = original.messageId ? originalToNewId.get(original.messageId) : null;
    if (!newMessageId) continue;

    const clonedAttachment = {
      ...createAttachment({
        threadId: newThread.id,
        messageId: newMessageId,
        objectKey: original.objectKey,
        fileName: original.fileName,
        mimeType: original.mimeType,
        sizeBytes: original.sizeBytes,
        sha256: original.sha256,
        status: original.status,
      }),
      width: original.width,
      height: original.height,
      optimistic: false as const,
      opId,
    };
    copiedAttachments.push(clonedAttachment);
  }

  // Optimistically apply to local collections
  applyLocalInsert("threads", newThread);
  for (const msg of copiedMessages) {
    applyLocalInsert("messages", msg);
  }
  for (const att of copiedAttachments) {
    applyLocalInsert("attachments", att);
  }

  const rollbackEntries: OptimisticEntry[] = [
    deleteRow("threads", newThread.id),
    ...copiedMessages.map((msg) => deleteRow("messages", msg.id)),
    ...copiedAttachments.map((att) => deleteRow("attachments", att.id)),
  ];
  trackOptimistic(opId, rollbackEntries);

  // Switch to the new thread
  setActiveThreadId(newThread.id);

  dispatch(
    "fork_thread",
    {
      sourceThreadId: input.sourceThreadId,
      sourceMessageId: input.sourceMessageId,
      newThread: toWire(newThread, opId),
      copiedMessages: copiedMessages.map((msg) => toWire(msg, opId)),
      copiedAttachments: copiedAttachments.map((att) => toWire(att, opId)),
    } satisfies ForkThreadPayload,
    { opId },
  );
}

export function archiveThreadAction(threadId: string) {
  const existing = threads.get(threadId);
  if (!existing) return;
  const updatedAt = nowIso();

  applyLocalUpdate("threads", {
    ...existing,
    archivedAt: updatedAt,
    updatedAt,
  });

  dispatch("archive_thread", { id: threadId, archivedAt: updatedAt });

  // Re-validate selection
  ensureActiveSelection([...workspaces.state.values()], [...threads.state.values()]);
}

export function archiveWorkspaceAction(workspaceId: string) {
  const existing = workspaces.get(workspaceId);
  if (!existing) return;
  const updatedAt = nowIso();

  applyLocalUpdate("workspaces", {
    ...existing,
    archivedAt: updatedAt,
    updatedAt,
  });

  dispatch("archive_workspace", { id: workspaceId, archivedAt: updatedAt });

  clearWorkspaceDraft(workspaceId);
  ensureActiveSelection([...workspaces.state.values()], [...threads.state.values()]);
}

export function updateThreadAction(thread: Thread) {
  const opId = createId("op");
  const existing = threads.get(thread.id);
  applyLocalUpdate("threads", toLocalSyncRow(thread, opId));
  if (existing) {
    trackOptimistic(opId, [restoreRow("threads", threads, existing)]);
  }
  dispatch("update_thread", { thread: toWire(thread, opId) }, { opId });
}

export function updateWorkspaceAction(workspace: Workspace) {
  const opId = createId("op");
  const existing = workspaces.get(workspace.id);
  applyLocalUpdate("workspaces", toLocalSyncRow(workspace, opId));
  if (existing) {
    trackOptimistic(opId, [restoreRow("workspaces", workspaces, existing)]);
  }
  dispatch("update_workspace", { workspace: toWire(workspace, opId) }, { opId });
}

export function updateAccountSettingsAction(settings: AccountSettings) {
  const opId = createId("op");
  const existing = accountSettings.get(settings.id);
  applyLocalUpdate("accountSettings", toLocalSyncRow(settings, opId));
  if (existing) {
    trackOptimistic(opId, [restoreRow("accountSettings", accountSettings, existing)]);
  }
  dispatch("update_account_settings", { settings: toWire(settings, opId) }, { opId });
}

export function sendMessageAction(input: {
  thread: Thread;
  text: string;
  modelId: string;
  modelInterleavedField?: string | null;
  reasoningLevel: ReasoningLevel;
  search: boolean;
  searchLimit?: number;
  preferFreeSearch?: boolean;
  attachmentIds?: string[];
}) {
  const opId = createId("op");
  const updatedAt = nowIso();
  const userMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: input.thread.headMessageId ?? null,
    role: "user",
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    text: input.text,
    searchEnabled: input.search,
    status: "completed",
  });
  const assistantMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: userMessage.id,
    role: "assistant",
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    text: "",
    searchEnabled: input.search,
    status: "pending",
  });
  debugLog("send", "message_action_created", {
    opId,
    threadId: input.thread.id,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    parentMessageId: userMessage.parentMessageId,
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    search: input.search,
    promptLength: input.text.length,
    attachmentCount: input.attachmentIds?.length ?? 0,
  });
  const threadUpdate: Thread = {
    ...input.thread,
    title: input.thread.title,
    headMessageId: assistantMessage.id,
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    searchEnabled: input.search,
    searchLimit: input.searchLimit ?? null,
    updatedAt,
    lastMessageAt: updatedAt,
  };

  // Optimistic mutations
  const existingThread = threads.get(input.thread.id);
  if (!existingThread) {
    applyLocalInsert("threads", toLocalSyncRow(input.thread, opId));
  }
  applyLocalUpdate("threads", toLocalSyncRow(threadUpdate, opId));
  applyLocalInsert("messages", toLocalSyncRow(userMessage, opId));
  applyLocalInsert("messages", toLocalSyncRow(assistantMessage, opId));

  const rollbackEntries: OptimisticEntry[] = [
    existingThread
      ? restoreRow("threads", threads, existingThread)
      : deleteRow("threads", input.thread.id),
    deleteRow("messages", userMessage.id),
    deleteRow("messages", assistantMessage.id),
  ];

  // Link attachments to the user message locally for immediate UI feedback.
  for (const attachmentId of input.attachmentIds ?? []) {
    const existing = attachments.get(attachmentId);
    if (!existing) continue;
    rollbackEntries.push(restoreRow("attachments", attachments, existing));
    applyLocalUpdate("attachments", {
      ...existing,
      messageId: userMessage.id,
      status: "ready",
      optimistic: false,
      opId,
    });
  }

  trackOptimistic(opId, rollbackEntries);

  dispatch(
    "create_user_message",
    {
      threadId: input.thread.id,
      thread: toWire(threadUpdate, opId),
      userMessage: toWire(userMessage, opId),
      assistantMessage: toWire(assistantMessage, opId),
      promptText: input.text,
      modelId: input.modelId,
      modelInterleavedField: input.modelInterleavedField ?? null,
      reasoningLevel: input.reasoningLevel,
      search: input.search,
      searchLimit: input.searchLimit,
      preferFreeSearch: input.preferFreeSearch,
      attachmentIds: input.attachmentIds ?? [],
    } satisfies CreateUserMessagePayload,
    { opId },
  );
}

export function retryMessageAction(input: {
  thread: Thread;
  userMessage: Message;
  modelId: string;
  modelInterleavedField?: string | null;
  reasoningLevel: ReasoningLevel;
  search: boolean;
  searchLimit?: number;
  preferFreeSearch?: boolean;
}) {
  const opId = createId("op");
  const updatedAt = nowIso();
  const assistantMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: input.userMessage.id,
    role: "assistant",
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    text: "",
    searchEnabled: input.search,
    status: "pending",
  });
  const threadUpdate: Thread = {
    ...input.thread,
    headMessageId: assistantMessage.id,
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    searchEnabled: input.search,
    searchLimit: input.searchLimit ?? null,
    updatedAt,
    lastMessageAt: updatedAt,
  };

  const existingThread = threads.get(input.thread.id);
  if (existingThread) {
    applyLocalUpdate("threads", toLocalSyncRow(threadUpdate, opId));
  }
  applyLocalInsert("messages", toLocalSyncRow(assistantMessage, opId));

  trackOptimistic(opId, [
    existingThread
      ? restoreRow("threads", threads, existingThread)
      : deleteRow("threads", input.thread.id),
    deleteRow("messages", assistantMessage.id),
  ]);

  dispatch(
    "retry_message",
    {
      threadId: input.thread.id,
      thread: toWire(threadUpdate, opId),
      userMessage: toWire(input.userMessage, opId),
      assistantMessage: toWire(assistantMessage, opId),
      modelId: input.modelId,
      modelInterleavedField: input.modelInterleavedField ?? null,
      reasoningLevel: input.reasoningLevel,
      search: input.search,
      searchLimit: input.searchLimit,
      preferFreeSearch: input.preferFreeSearch,
    } satisfies RetryMessagePayload,
    { opId },
  );
}

export function editUserMessageAction(input: {
  thread: Thread;
  sourceMessage: Message;
  text: string;
  modelId: string;
  modelInterleavedField?: string | null;
  reasoningLevel: ReasoningLevel;
  search: boolean;
  searchLimit?: number;
  preferFreeSearch?: boolean;
  attachmentIds?: string[];
}) {
  const opId = createId("op");
  const updatedAt = nowIso();
  const userMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: input.sourceMessage.parentMessageId ?? null,
    sourceMessageId: input.sourceMessage.id,
    role: "user",
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    text: input.text,
    searchEnabled: input.search,
    status: "completed",
  });
  const assistantMessage = createMessage({
    threadId: input.thread.id,
    parentMessageId: userMessage.id,
    role: "assistant",
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    text: "",
    searchEnabled: input.search,
    status: "pending",
  });
  const threadUpdate: Thread = {
    ...input.thread,
    headMessageId: assistantMessage.id,
    modelId: input.modelId,
    reasoningLevel: input.reasoningLevel,
    searchEnabled: input.search,
    searchLimit: input.searchLimit ?? null,
    updatedAt,
    lastMessageAt: updatedAt,
  };

  const existingThread = threads.get(input.thread.id);
  if (existingThread) {
    applyLocalUpdate("threads", toLocalSyncRow(threadUpdate, opId));
  }
  applyLocalInsert("messages", toLocalSyncRow(userMessage, opId));
  applyLocalInsert("messages", toLocalSyncRow(assistantMessage, opId));

  const rollbackEntries: OptimisticEntry[] = [
    existingThread
      ? restoreRow("threads", threads, existingThread)
      : deleteRow("threads", input.thread.id),
    deleteRow("messages", userMessage.id),
    deleteRow("messages", assistantMessage.id),
  ];
  const clonedAttachments: Attachment[] = [];

  for (const attachmentId of input.attachmentIds ?? []) {
    const existing = attachments.get(attachmentId);
    if (!existing || existing.status !== "ready") continue;
    const clonedAttachment = {
      ...createAttachment({
        threadId: input.thread.id,
        messageId: userMessage.id,
        objectKey: existing.objectKey,
        fileName: existing.fileName,
        mimeType: existing.mimeType,
        sizeBytes: existing.sizeBytes,
        sha256: existing.sha256,
        status: "ready",
      }),
      width: existing.width,
      height: existing.height,
      optimistic: false as const,
      opId,
    };
    applyLocalInsert("attachments", clonedAttachment);
    rollbackEntries.push(deleteRow("attachments", clonedAttachment.id));
    clonedAttachments.push(clonedAttachment);
  }

  trackOptimistic(opId, rollbackEntries);

  dispatch(
    "edit_user_message",
    {
      threadId: input.thread.id,
      sourceMessageId: input.sourceMessage.id,
      thread: toWire(threadUpdate, opId),
      userMessage: toWire(userMessage, opId),
      assistantMessage: toWire(assistantMessage, opId),
      promptText: input.text,
      modelId: input.modelId,
      modelInterleavedField: input.modelInterleavedField ?? null,
      reasoningLevel: input.reasoningLevel,
      search: input.search,
      searchLimit: input.searchLimit,
      preferFreeSearch: input.preferFreeSearch,
      attachments: clonedAttachments.map((attachment) => toWire(attachment, opId)),
    } satisfies EditUserMessagePayload,
    { opId },
  );
}

/**
 * Cancel an in-flight assistant response. The server marks the message
 * `failed` with errorCode "cancelled", which releases the thread's "busy"
 * state client-side and lets the user regain control immediately.
 */
export function cancelAssistantTurnAction(messageId: string) {
  const opId = createId("op");
  dispatch("cancel_assistant_turn", { messageId } satisfies CancelAssistantTurnPayload, { opId });
}

export function deleteAttachmentAction(attachmentId: string) {
  dispatch("delete_attachment", { id: attachmentId });
}

export function updateAttachmentAction(attachment: Attachment) {
  const opId = createId("op");
  const existing = attachments.get(attachment.id);
  applyLocalUpdate("attachments", toLocalSyncRow(attachment, opId));
  if (existing) {
    trackOptimistic(opId, [restoreRow("attachments", attachments, existing)]);
  }
  dispatch("update_attachment", { attachment: toWire(attachment, opId) }, { opId });
}

export function resetAllData() {
  const opId = createId("op");
  // Tell server to wipe all DO state
  dispatch("reset_storage", {}, { opId });
  // Clear local state
  if (globalThis.localStorage) {
    localStorage.removeItem("shedflare.lastServerSeq");
    localStorage.removeItem("shedflare.activeWorkspaceId");
    localStorage.removeItem("shedflare.activeThreadId");
    localStorage.removeItem("shedflare.clientId");
  }
  clearAllDraftState();
  // Reload to get fresh state from server
  setTimeout(() => location.reload(), 300);
}
