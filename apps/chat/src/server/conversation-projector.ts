import * as dbSchema from "#/db/schema";
import { eq } from "drizzle-orm";
import type { ProjectionContext, ProjectionInput } from "./projection-types";

export function projectConversation(input: ProjectionInput, context: ProjectionContext): void {
  const { eventType, payload } = input;
  switch (eventType) {
    case "thread_upserted": {
      const row = payload.row;
      context.sql.database.runSync(
        context.sql.db
          .insert(dbSchema.threads)
          .values(row)
          .onConflictDoUpdate({
            target: dbSchema.threads.id,
            set: {
              workspaceId: row.workspaceId,
              title: row.title,
              pinned: row.pinned,
              headMessageId: row.headMessageId,
              modelId: row.modelId,
              reasoningLevel: row.reasoningLevel,
              searchEnabled: row.searchEnabled,
              searchLimit: row.searchLimit,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              lastMessageAt: row.lastMessageAt,
              archivedAt: row.archivedAt,
              forkedFromThreadId: row.forkedFromThreadId ?? null,
              forkedFromMessageId: row.forkedFromMessageId ?? null,
              threadType: row.threadType ?? null,
              comparisonGroupId: row.comparisonGroupId ?? null,
              optimistic: row.optimistic ?? null,
              opId: row.opId ?? null,
            },
          }),
      );
      break;
    }
    case "thread_archived": {
      const row = context.repository.getThread(payload.id);
      if (!row) break;
      context.project({
        eventType: "thread_upserted",
        payload: {
          row: { ...row, archivedAt: payload.archivedAt, updatedAt: payload.updatedAt },
        },
      });
      break;
    }
    case "message_upserted": {
      const row = payload.row;
      context.sql.database.runSync(
        context.sql.db
          .insert(dbSchema.messages)
          .values(row)
          .onConflictDoUpdate({
            target: dbSchema.messages.id,
            set: {
              threadId: row.threadId,
              parentMessageId: row.parentMessageId,
              sourceMessageId: row.sourceMessageId,
              role: row.role,
              status: row.status,
              modelId: row.modelId,
              reasoningLevel: row.reasoningLevel,
              text: row.text,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              errorCode: row.errorCode,
              errorMessage: row.errorMessage,
              searchEnabled: row.searchEnabled,
              durationMs: row.durationMs,
              ttftMs: row.ttftMs,
              promptTokens: row.promptTokens,
              completionTokens: row.completionTokens,
              optimistic: row.optimistic ?? null,
              opId: row.opId ?? null,
            },
          }),
      );
      break;
    }
    case "message_delta": {
      const row = context.repository.getMessage(payload.messageId);
      if (!row) break;
      context.project({
        eventType: "message_upserted",
        payload: {
          row: {
            ...row,
            text: `${row.text}${payload.delta}`,
            status: "streaming",
            updatedAt: payload.updatedAt,
            optimistic: false,
          },
        },
      });
      break;
    }
    case "message_completed": {
      const row = context.repository.getMessage(payload.messageId);
      if (!row) break;
      context.project({
        eventType: "message_upserted",
        payload: {
          row: {
            ...row,
            text: payload.text,
            status: "completed",
            updatedAt: payload.updatedAt,
            durationMs: payload.durationMs ?? null,
            ttftMs: payload.ttftMs ?? null,
            promptTokens: payload.promptTokens ?? null,
            completionTokens: payload.completionTokens ?? null,
            optimistic: false,
          },
        },
      });
      break;
    }
    case "message_failed": {
      const row = context.repository.getMessage(payload.messageId);
      if (!row) break;
      context.project({
        eventType: "message_upserted",
        payload: {
          row: {
            ...row,
            status: "failed",
            errorCode: payload.errorCode,
            errorMessage: payload.errorMessage,
            updatedAt: payload.updatedAt,
            optimistic: false,
          },
        },
      });
      break;
    }
    case "message_part_appended": {
      const row = payload.row;
      context.sql.database.runSync(
        context.sql.db
          .insert(dbSchema.messageParts)
          .values(row)
          .onConflictDoUpdate({
            target: dbSchema.messageParts.id,
            set: {
              messageId: row.messageId,
              seq: row.seq,
              kind: row.kind,
              text: row.text,
              json: row.json,
            },
          }),
      );
      break;
    }
    case "attachment_upserted": {
      const row = payload.row;
      context.sql.database.runSync(
        context.sql.db
          .insert(dbSchema.attachments)
          .values(row)
          .onConflictDoUpdate({
            target: dbSchema.attachments.id,
            set: {
              threadId: row.threadId,
              messageId: row.messageId,
              objectKey: row.objectKey,
              fileName: row.fileName,
              mimeType: row.mimeType,
              sizeBytes: row.sizeBytes,
              sha256: row.sha256,
              width: row.width,
              height: row.height,
              status: row.status,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              optimistic: row.optimistic ?? null,
              opId: row.opId ?? null,
            },
          }),
      );
      break;
    }
    case "attachment_deleted": {
      context.sql.database.runSync(
        context.sql.db.delete(dbSchema.attachments).where(eq(dbSchema.attachments.id, payload.id)),
      );
      break;
    }
    case "thread_deleted": {
      context.repository.deleteThreadCascade(payload.id);
      break;
    }
  }
}
