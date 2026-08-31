import type { Message } from "#/domain";
import {
  completeTextAttachment,
  getInlineAttachment,
  isImageAttachment,
  isInlineTextAttachment,
  type AppEnv,
  type ContentPart,
  type ModelMessage,
} from "#/runtime";
import type { ChatRepository } from "./chat-repository";

type SupportedContentPart = Extract<ContentPart, { type: "text" | "image" }>;
type SupportedModelMessage = ModelMessage<string | null | SupportedContentPart[]>;

function modelMessageUserIds(messages: readonly ModelMessage[]) {
  return messages.flatMap((message, index) =>
    message.role === "user" && message.id ? [{ id: message.id, index }] : [],
  );
}

/**
 * Rebase the current product message branch onto TanStack's richer canonical
 * transcript. Stable user-message IDs keep native tool/reasoning history up to
 * the branch point, while edits and retries replace only the changed suffix.
 */
export function mergePersistedModelHistory(input: {
  persisted: readonly ModelMessage[];
  rebuilt: readonly ModelMessage[];
  latestUserMessageId: string;
}): ModelMessage[] {
  const rebuiltUsers = modelMessageUserIds(input.rebuilt);
  const latestUserPosition = rebuiltUsers.findIndex(
    (entry) => entry.id === input.latestUserMessageId,
  );
  if (latestUserPosition < 0) return [...input.rebuilt];

  const currentUsers = rebuiltUsers.slice(0, latestUserPosition + 1);
  const persistedUsers = modelMessageUserIds(input.persisted);
  let commonUsers = 0;
  while (
    commonUsers < currentUsers.length &&
    commonUsers < persistedUsers.length &&
    currentUsers[commonUsers]?.id === persistedUsers[commonUsers]?.id
  ) {
    commonUsers += 1;
  }

  const retryingPersistedUser =
    commonUsers === currentUsers.length && currentUsers.at(-1)?.id === input.latestUserMessageId;
  if (retryingPersistedUser) {
    const persistedTargetIndex = persistedUsers[commonUsers - 1]?.index ?? 0;
    const rebuiltTargetIndex = currentUsers[commonUsers - 1]?.index ?? 0;
    return [
      ...input.persisted.slice(0, persistedTargetIndex),
      ...input.rebuilt.slice(rebuiltTargetIndex),
    ];
  }

  const persistedCutIndex = persistedUsers[commonUsers]?.index ?? input.persisted.length;
  const rebuiltStartIndex = currentUsers[commonUsers]?.index ?? 0;
  return [
    ...input.persisted.slice(0, persistedCutIndex),
    ...input.rebuilt.slice(rebuiltStartIndex),
  ];
}

export async function buildModelMessages(
  workspaceId: string,
  threadMessages: Message[],
  repository: ChatRepository,
  env: AppEnv,
): Promise<{ messages: SupportedModelMessage[]; systemPrompts: string[] }> {
  const workspace = repository.getWorkspace(workspaceId) ?? undefined;
  const threadId = threadMessages[0]?.threadId;
  const attachments = threadId ? repository.getReadyAttachments(threadId) : [];

  const systemPrompts: string[] = [];
  if (workspace?.systemPrompt) {
    systemPrompts.push(workspace.systemPrompt);
  }

  const messages: SupportedModelMessage[] = [];

  for (const message of threadMessages) {
    if (message.status === "failed" || message.status === "cancelled") continue;
    if (message.role === "system") {
      if (message.text.trim()) systemPrompts.push(message.text);
      continue;
    }

    const contentParts: SupportedContentPart[] = [];

    if (message.text?.trim()) {
      contentParts.push({ type: "text", content: message.text });
    }

    if (message.role === "user") {
      const tasks = attachments
        .filter((attachment) => attachment.messageId === message.id)
        .map(async (attachment) => {
          if (isImageAttachment(attachment.mimeType)) {
            const inlineAttachment = await getInlineAttachment(
              env,
              attachment.objectKey,
              attachment.mimeType,
            );
            if (!inlineAttachment) return null;
            return {
              type: "image" as const,
              source: {
                type: "data" as const,
                value: inlineAttachment.base64,
                mimeType: inlineAttachment.mimeType,
              },
            };
          }
          if (isInlineTextAttachment(attachment.mimeType, attachment.sizeBytes)) {
            const text = await completeTextAttachment(env, attachment.objectKey);
            if (text) {
              return {
                type: "text" as const,
                content: `Attachment ${attachment.fileName}:\n${text.slice(0, 10_000)}`,
              };
            }
          }
          return null;
        });

      const settled = await Promise.allSettled(tasks);
      for (const result of settled) {
        if (result.status === "rejected") continue;
        if (result.value !== null) {
          contentParts.push(result.value);
        }
      }
    }

    if (message.role === "assistant" && contentParts.length === 0) continue;

    const onlyPart = contentParts.length === 1 ? contentParts[0] : undefined;
    const content: SupportedModelMessage["content"] =
      onlyPart?.type === "text" ? onlyPart.content : contentParts;

    const modelMessage: SupportedModelMessage = {
      role: message.role,
      content,
      id: message.id,
      createdAt: new Date(message.createdAt),
    };
    if (message.role === "assistant") {
      modelMessage.thinking = repository
        .getMessageParts(message.id)
        .filter((part) => part.kind === "reasoning" && part.text)
        .map((part) => ({ content: part.text }));
    }
    messages.push(modelMessage);
  }

  return { messages, systemPrompts };
}
