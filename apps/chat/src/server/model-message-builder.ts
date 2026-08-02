import type { Message } from "#/domain";
import {
  completeTextAttachment,
  getInlineAttachment,
  isImageAttachment,
  isInlineTextAttachment,
  type AppEnv,
  type ModelMessage,
} from "#/runtime";
import type { ChatRepository } from "./chat-repository";

export async function buildModelMessages(
  workspaceId: string,
  threadMessages: Message[],
  repository: ChatRepository,
  env: AppEnv,
): Promise<{ messages: ModelMessage[]; systemPrompts: string[] }> {
  const workspace = repository.getWorkspace(workspaceId) ?? undefined;
  const threadId = threadMessages[0]?.threadId;
  const attachments = threadId ? repository.getReadyAttachments(threadId) : [];

  const systemPrompts: string[] = [];
  if (workspace?.systemPrompt) {
    systemPrompts.push(workspace.systemPrompt);
  }

  const messages: ModelMessage[] = [];

  for (const message of threadMessages) {
    if (message.status === "failed" || message.status === "cancelled") continue;

    const contentParts: Array<
      string | { type: "image"; source: { type: "data"; value: string; mimeType: string } }
    > = [];

    if (message.text?.trim()) {
      contentParts.push(message.text);
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
              return `Attachment ${attachment.fileName}:\n${text.slice(0, 10_000)}`;
            }
          }
          return null;
        });

      const settled = await Promise.allSettled(tasks);
      for (const result of settled) {
        if (result.status === "rejected") continue;
        if (result.value !== null) {
          contentParts.push(result.value as (typeof contentParts)[number]);
        }
      }
    }

    if (message.role === "assistant" && contentParts.length === 0) continue;

    const content: ModelMessage["content"] =
      contentParts.length === 1 && typeof contentParts[0] === "string"
        ? contentParts[0]
        : (contentParts as ModelMessage["content"]);

    messages.push({
      role: message.role as "user" | "assistant",
      content,
    });
  }

  return { messages, systemPrompts };
}
