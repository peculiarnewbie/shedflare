import {
  createWorkspace,
  createThread,
  createAccountSettings,
  nowIso,
  mergeAttachmentLink,
  type CreateUserMessagePayload,
  type EditUserMessagePayload,
  type ForkThreadPayload,
  type RetryMessagePayload,
  type SyncCommandPayloadMap,
  type SyncServerEvent,
  type Thread,
  type Message,
} from "#/domain";
import { getDefaultModelId, type AppEnv } from "#/runtime";
import { deleteAllData } from "./schema-helpers";
import type { DataAccess } from "./data-access";
import type { ChatRepository } from "./chat-repository";
import {
  normalizeWorkspace,
  normalizeThread,
  normalizeMessage,
  normalizeAttachment,
  normalizeAccountSettings,
} from "./persistence-codecs";
import type { EventStore } from "./event-store";

// ---------------------------------------------------------------------------
// Deferred work type
// ---------------------------------------------------------------------------

export type DeferredFollowUp = () => Promise<void>;

// ---------------------------------------------------------------------------
// Context passed to every command handler
// ---------------------------------------------------------------------------

export interface CommandHandlerContext {
  access: ChatRepository;
  sql: DataAccess;
  eventStore: EventStore;
  env: AppEnv;
  assistantTurnControllers: Map<string, AbortController>;
  runAssistantTurn: (payload: AssistantTurnPayload) => Promise<void>;
  generateThreadTitle: (input: TitleGenerationPayload) => Promise<void>;
}

export type AssistantTurnPayload = Pick<
  CreateUserMessagePayload,
  | "threadId"
  | "modelId"
  | "modelInterleavedField"
  | "reasoningLevel"
  | "search"
  | "searchLimit"
  | "preferFreeSearch"
> & {
  thread: Thread;
  userMessage: Message;
  assistantMessage: Message;
};

export type TitleGenerationPayload = {
  threadId: string;
  promptText: string;
  chatModelId: string;
  chatModelInterleavedField?: string | null;
};

// ---------------------------------------------------------------------------
// Handler result
// ---------------------------------------------------------------------------

export interface CommandHandlerResult {
  events: SyncServerEvent[];
  followUp?: DeferredFollowUp;
}

// ---------------------------------------------------------------------------
// Handler implementations
// ---------------------------------------------------------------------------

export function handleBootstrapSession(
  opId: string,
  payload: SyncCommandPayloadMap["bootstrap_session"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  const events: SyncServerEvent[] = [];
  const workspaces = ctx.sql.queryOne<{ count: number }>(
    "SELECT count(*) as count FROM workspaces",
  );
  if (Number(workspaces?.count ?? 0) === 0) {
    const settings = {
      ...createAccountSettings({ id: "default" }),
      optimistic: false,
      opId,
    };
    const workspace = {
      ...createWorkspace({
        name: "Default Workspace",
        defaultModelId: payload.defaultModelId,
      }),
      optimistic: false,
      opId,
    };
    const thread = {
      ...createThread({
        workspaceId: workspace.id,
        title: "New Chat",
      }),
      optimistic: false,
      opId,
    };
    events.push(
      ctx.eventStore.insertEvent(opId, "account_settings_upserted", { row: settings }),
      ctx.eventStore.insertEvent(opId, "workspace_upserted", { row: workspace }),
      ctx.eventStore.insertEvent(opId, "thread_upserted", { row: thread }),
    );
  }
  return { events };
}

export function handleUpdateAccountSettings(
  opId: string,
  payload: SyncCommandPayloadMap["update_account_settings"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "account_settings_upserted", {
        row: normalizeAccountSettings(payload.settings, opId),
      }),
    ],
  };
}

export function handleCreateWorkspace(
  opId: string,
  payload: SyncCommandPayloadMap["create_workspace"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "workspace_upserted", {
        row: normalizeWorkspace(payload.workspace, opId),
      }),
      ctx.eventStore.insertEvent(opId, "thread_upserted", {
        row: normalizeThread(payload.initialThread, opId),
      }),
    ],
  };
}

export function handleUpdateWorkspace(
  opId: string,
  payload: SyncCommandPayloadMap["update_workspace"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "workspace_upserted", {
        row: normalizeWorkspace(payload.workspace, opId),
      }),
    ],
  };
}

export function handleArchiveWorkspace(
  opId: string,
  payload: SyncCommandPayloadMap["archive_workspace"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  if (!ctx.access.getWorkspace(payload.id)) throw new Error("Workspace not found");
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "workspace_archived", {
        id: payload.id,
        archivedAt: payload.archivedAt,
        updatedAt: nowIso(),
      }),
    ],
  };
}

export function handleUpsertThread(
  opId: string,
  payload: SyncCommandPayloadMap["create_thread"] | SyncCommandPayloadMap["update_thread"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "thread_upserted", {
        row: normalizeThread(payload.thread, opId),
      }),
    ],
  };
}

export function handleForkThread(
  opId: string,
  payload: ForkThreadPayload,
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  const { sourceThreadId, sourceMessageId, newThread, copiedMessages, copiedAttachments } = payload;

  // Validate source thread exists
  const sourceThread = ctx.access.getThread(sourceThreadId);
  if (!sourceThread) throw new Error(`Source thread ${sourceThreadId} not found`);

  // Validate source message exists in the source thread
  const sourceMessage = ctx.access.getMessage(sourceMessageId);
  if (!sourceMessage) throw new Error(`Source message ${sourceMessageId} not found`);
  if (sourceMessage.threadId !== sourceThreadId) {
    throw new Error(
      `Source message ${sourceMessageId} does not belong to thread ${sourceThreadId}`,
    );
  }

  const events: SyncServerEvent[] = [
    ctx.eventStore.insertEvent(opId, "thread_upserted", {
      row: normalizeThread(newThread, opId),
    }),
  ];

  for (const message of copiedMessages) {
    events.push(
      ctx.eventStore.insertEvent(opId, "message_upserted", {
        row: normalizeMessage(message, opId),
      }),
    );
  }

  for (const attachment of copiedAttachments) {
    events.push(
      ctx.eventStore.insertEvent(opId, "attachment_upserted", {
        row: normalizeAttachment(attachment, opId),
      }),
    );
  }

  return { events };
}

export function handleDeleteThread(
  opId: string,
  payload: SyncCommandPayloadMap["delete_thread"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  if (!ctx.access.getThread(payload.id)) throw new Error("Thread not found");
  return {
    events: [ctx.eventStore.insertEvent(opId, "thread_deleted", { id: payload.id })],
  };
}

export function handleArchiveThread(
  opId: string,
  payload: SyncCommandPayloadMap["archive_thread"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  if (!ctx.access.getThread(payload.id)) throw new Error("Thread not found");
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "thread_archived", {
        id: payload.id,
        archivedAt: payload.archivedAt,
        updatedAt: nowIso(),
      }),
    ],
  };
}

export function handleCreateUserMessage(
  opId: string,
  payload: SyncCommandPayloadMap["create_user_message"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  const normalizedThread = normalizeThread(payload.thread, opId);
  const userMessage = normalizeMessage({ ...payload.userMessage, status: "completed" }, opId);
  const assistantMessage = normalizeMessage(
    { ...payload.assistantMessage, status: "pending", text: "" },
    opId,
  );
  const events: SyncServerEvent[] = [
    ctx.eventStore.insertEvent(opId, "thread_upserted", { row: normalizedThread }),
    ctx.eventStore.insertEvent(opId, "message_upserted", { row: userMessage }),
    ctx.eventStore.insertEvent(opId, "message_upserted", { row: assistantMessage }),
  ];
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
  const followUp: DeferredFollowUp = async () => {
    // The answer owns the latency-sensitive provider slot. Title generation is
    // useful metadata, but it should never compete with first-token latency.
    await Promise.allSettled([
      ctx.runAssistantTurn({
        ...payload,
        thread: normalizedThread,
        userMessage,
        assistantMessage,
      }),
    ]);
    await Promise.allSettled([
      ctx.generateThreadTitle({
        threadId: normalizedThread.id,
        promptText: payload.promptText,
        chatModelId: payload.modelId,
        chatModelInterleavedField: payload.modelInterleavedField,
      }),
    ]);
  };
  return { events, followUp };
}

export function handleRetryMessage(
  opId: string,
  payload: RetryMessagePayload,
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  const normalizedThread = normalizeThread(payload.thread, opId);
  const userMessage = ctx.access.getMessage(payload.userMessage.id);
  if (!userMessage) throw new Error("Message not found");
  const assistantMessage = normalizeMessage(
    { ...payload.assistantMessage, status: "pending", text: "" },
    opId,
  );
  const events: SyncServerEvent[] = [
    ctx.eventStore.insertEvent(opId, "thread_upserted", { row: normalizedThread }),
    ctx.eventStore.insertEvent(opId, "message_upserted", { row: assistantMessage }),
  ];
  const followUp: DeferredFollowUp = () =>
    ctx.runAssistantTurn({
      ...payload,
      thread: normalizedThread,
      userMessage,
      assistantMessage,
    });
  return { events, followUp };
}

export function handleEditUserMessage(
  opId: string,
  payload: EditUserMessagePayload,
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  const normalizedThread = normalizeThread(payload.thread, opId);
  if (!ctx.access.getMessage(payload.sourceMessageId)) throw new Error("Message not found");
  const userMessage = normalizeMessage({ ...payload.userMessage, status: "completed" }, opId);
  const assistantMessage = normalizeMessage(
    { ...payload.assistantMessage, status: "pending", text: "" },
    opId,
  );
  const events: SyncServerEvent[] = [
    ctx.eventStore.insertEvent(opId, "thread_upserted", { row: normalizedThread }),
    ctx.eventStore.insertEvent(opId, "message_upserted", { row: userMessage }),
    ctx.eventStore.insertEvent(opId, "message_upserted", { row: assistantMessage }),
  ];
  if (payload.attachments?.length) {
    for (const attachment of payload.attachments) {
      events.push(
        ctx.eventStore.insertEvent(opId, "attachment_upserted", {
          row: normalizeAttachment(attachment, opId),
        }),
      );
    }
  }
  const followUp: DeferredFollowUp = () =>
    ctx.runAssistantTurn({
      ...payload,
      thread: normalizedThread,
      userMessage,
      assistantMessage,
    });
  return { events, followUp };
}

export function handleStartAssistantTurn(
  opId: string,
  payload: SyncCommandPayloadMap["start_assistant_turn"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "message_upserted", {
        row: normalizeMessage({ ...payload.assistantMessage, status: "pending", text: "" }, opId),
      }),
    ],
  };
}

export function handleCancelAssistantTurn(
  opId: string,
  payload: SyncCommandPayloadMap["cancel_assistant_turn"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  if (!ctx.access.getMessage(payload.messageId)) throw new Error("Message not found");
  ctx.assistantTurnControllers.get(payload.messageId)?.abort(new Error("Cancelled"));
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "message_failed", {
        messageId: payload.messageId,
        errorCode: "cancelled",
        errorMessage: "Cancelled",
        updatedAt: nowIso(),
      }),
    ],
  };
}

export function handleUpsertAttachment(
  opId: string,
  payload:
    | SyncCommandPayloadMap["register_attachment"]
    | SyncCommandPayloadMap["complete_attachment"]
    | SyncCommandPayloadMap["update_attachment"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  const existing = ctx.access.getAttachment(payload.attachment.id);
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "attachment_upserted", {
        row: normalizeAttachment(mergeAttachmentLink(existing, payload.attachment), opId),
      }),
    ],
  };
}

export function handleDeleteAttachment(
  opId: string,
  payload: SyncCommandPayloadMap["delete_attachment"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  return {
    events: [ctx.eventStore.insertEvent(opId, "attachment_deleted", { id: payload.id })],
  };
}

export function handleSetSearchMode(
  opId: string,
  payload: SyncCommandPayloadMap["set_search_mode"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  const workspace = ctx.access.getWorkspace(payload.workspaceId);
  if (!workspace) throw new Error("Workspace not found");
  return {
    events: [
      ctx.eventStore.insertEvent(opId, "workspace_upserted", {
        row: normalizeWorkspace(
          {
            ...workspace,
            defaultSearchMode: payload.defaultSearchMode,
            updatedAt: nowIso(),
          },
          opId,
        ),
      }),
    ],
  };
}

export function handleResetStorage(
  opId: string,
  _payload: SyncCommandPayloadMap["reset_storage"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  const events: SyncServerEvent[] = [];
  deleteAllData(ctx.sql.exec.bind(ctx.sql));
  const workspace = {
    ...createWorkspace({
      name: "Default Workspace",
      defaultModelId: getDefaultModelId(ctx.env),
    }),
    optimistic: false,
    opId,
  };
  const thread = {
    ...createThread({
      workspaceId: workspace.id,
      title: "New Chat",
    }),
    optimistic: false,
    opId,
  };
  const settings = {
    ...createAccountSettings({ id: "default" }),
    optimistic: false,
    opId,
  };
  events.push(
    ctx.eventStore.insertEvent(opId, "account_settings_upserted", { row: settings }),
    ctx.eventStore.insertEvent(opId, "workspace_upserted", { row: workspace }),
    ctx.eventStore.insertEvent(opId, "thread_upserted", { row: thread }),
  );
  return { events };
}

export function handleCreateComparison(
  opId: string,
  payload: SyncCommandPayloadMap["create_comparison"],
  ctx: CommandHandlerContext,
): CommandHandlerResult {
  const events: SyncServerEvent[] = [];

  // 1. Upsert comparison group
  events.push(
    ctx.eventStore.insertEvent(opId, "comparison_group_upserted", {
      row: { ...payload.comparisonGroup, optimistic: false, opId },
    }),
  );

  // 2. Upsert all threads
  for (const thread of payload.threads) {
    events.push(
      ctx.eventStore.insertEvent(opId, "thread_upserted", {
        row: { ...thread, optimistic: false, opId },
      }),
    );
  }

  // 3. Upsert all user messages and assistant messages
  for (const userMessage of payload.userMessages) {
    events.push(
      ctx.eventStore.insertEvent(opId, "message_upserted", {
        row: { ...userMessage, status: "completed", optimistic: false, opId },
      }),
    );
  }
  for (const assistantMessage of payload.assistantMessages) {
    events.push(
      ctx.eventStore.insertEvent(opId, "message_upserted", {
        row: { ...assistantMessage, status: "pending", text: "", optimistic: false, opId },
      }),
    );
  }

  // 4. Link attachments to user messages
  if (payload.attachmentIds?.length) {
    for (const userMessage of payload.userMessages) {
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
  }

  // 5. Follow-up: run N assistant turns in parallel + generate title once
  const normalizedThreads = payload.threads.map((t) => normalizeThread(t, opId));
  const followUp: DeferredFollowUp = () =>
    Promise.allSettled([
      // Title generation only from first thread
      ctx.generateThreadTitle({
        threadId: normalizedThreads[0].id,
        promptText: payload.promptText,
        chatModelId: payload.modelIds[0],
        chatModelInterleavedField: payload.modelInterleavedFields[0] ?? null,
      }),
      // Run one assistant turn per thread/model
      ...normalizedThreads.map((thread, i) =>
        ctx.runAssistantTurn({
          threadId: thread.id,
          modelId: payload.modelIds[i],
          modelInterleavedField: payload.modelInterleavedFields[i] ?? null,
          reasoningLevel: payload.reasoningLevel,
          search: payload.search,
          searchLimit: payload.searchLimit,
          preferFreeSearch: payload.preferFreeSearch,
          thread,
          userMessage: payload.userMessages[i],
          assistantMessage: payload.assistantMessages[i],
        }),
      ),
    ]).then(() => undefined);

  return { events, followUp };
}
