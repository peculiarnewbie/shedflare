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

    messages.push({
      role: message.role,
      content,
    });
  }

  return { messages, systemPrompts };
}
