import { decodeMessageRow, resolveThreadMessagePath, type Message, type Thread } from "#/domain";
import * as dbSchema from "#/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import type { DataAccess } from "./data-access";
import { deletePersistedChatThread } from "./chat-persistence";

/** Typed Chat row operations layered over the shared synchronous SQLite access. */
export class ChatRepository {
  constructor(private readonly sql: DataAccess) {}

  getWorkspace(id: string) {
    return (
      this.sql.database.runSync(
        this.sql.db.select().from(dbSchema.workspaces).where(eq(dbSchema.workspaces.id, id)).get(),
      ) ?? null
    );
  }

  getAccountSettings() {
    return (
      this.sql.database.runSync(
        this.sql.db
          .select()
          .from(dbSchema.accountSettings)
          .where(eq(dbSchema.accountSettings.id, "default"))
          .get(),
      ) ?? null
    );
  }

  getThread(id: string) {
    return (
      this.sql.database.runSync(
        this.sql.db.select().from(dbSchema.threads).where(eq(dbSchema.threads.id, id)).get(),
      ) ?? null
    );
  }

  deleteThreadCascade(id: string) {
    deletePersistedChatThread(this.sql.database, id);
    const messageIds = this.sql.database
      .runSync(
        this.sql.db
          .select({ id: dbSchema.messages.id })
          .from(dbSchema.messages)
          .where(eq(dbSchema.messages.threadId, id)),
      )
      .map((row) => row.id);

    if (messageIds.length > 0) {
      const traceRunIds = this.sql.database
        .runSync(
          this.sql.db
            .select({ id: dbSchema.traceRuns.id })
            .from(dbSchema.traceRuns)
            .where(inArray(dbSchema.traceRuns.messageId, messageIds)),
        )
        .map((row) => row.id);
      if (traceRunIds.length > 0) {
        this.sql.database.runSync(
          this.sql.db
            .delete(dbSchema.traceSpans)
            .where(inArray(dbSchema.traceSpans.traceRunId, traceRunIds)),
        );
      }
      this.sql.database.runSync(
        this.sql.db
          .delete(dbSchema.traceRuns)
          .where(inArray(dbSchema.traceRuns.messageId, messageIds)),
      );
      this.sql.database.runSync(
        this.sql.db
          .delete(dbSchema.searchResults)
          .where(inArray(dbSchema.searchResults.messageId, messageIds)),
      );
      this.sql.database.runSync(
        this.sql.db
          .delete(dbSchema.searchRuns)
          .where(inArray(dbSchema.searchRuns.messageId, messageIds)),
      );
      this.sql.database.runSync(
        this.sql.db
          .delete(dbSchema.extractRuns)
          .where(inArray(dbSchema.extractRuns.messageId, messageIds)),
      );
      this.sql.database.runSync(
        this.sql.db
          .delete(dbSchema.messageParts)
          .where(inArray(dbSchema.messageParts.messageId, messageIds)),
      );
      this.sql.database.runSync(
        this.sql.db.delete(dbSchema.messages).where(inArray(dbSchema.messages.id, messageIds)),
      );
    }

    this.sql.database.runSync(
      this.sql.db.delete(dbSchema.attachments).where(eq(dbSchema.attachments.threadId, id)),
    );
    this.sql.database.runSync(
      this.sql.db.delete(dbSchema.threads).where(eq(dbSchema.threads.id, id)),
    );
  }

  getMessage(id: string) {
    const row = this.sql.database.runSync(
      this.sql.db.select().from(dbSchema.messages).where(eq(dbSchema.messages.id, id)).get(),
    );
    return row ? decodeMessageRow(row) : null;
  }

  getMessageParts(messageId: string) {
    return this.sql.database.runSync(
      this.sql.db
        .select()
        .from(dbSchema.messageParts)
        .where(eq(dbSchema.messageParts.messageId, messageId))
        .orderBy(asc(dbSchema.messageParts.seq)),
    );
  }

  getAttachment(id: string) {
    return (
      this.sql.database.runSync(
        this.sql.db
          .select()
          .from(dbSchema.attachments)
          .where(eq(dbSchema.attachments.id, id))
          .get(),
      ) ?? null
    );
  }

  getReadyAttachments(threadId: string) {
    return this.sql.database
      .runSync(
        this.sql.db
          .select()
          .from(dbSchema.attachments)
          .where(eq(dbSchema.attachments.threadId, threadId)),
      )
      .filter((attachment) => attachment.status === "ready");
  }

  getThreadMessages(
    thread: Pick<Thread, "id" | "headMessageId">,
    additionalMessages: Message[] = [],
  ) {
    const byId = new Map<string, Message>();
    const rows = this.sql.database.runSync(
      this.sql.db.select().from(dbSchema.messages).where(eq(dbSchema.messages.threadId, thread.id)),
    );
    for (const row of rows) {
      const message = decodeMessageRow(row);
      byId.set(message.id, message);
    }
    for (const message of additionalMessages) {
      if (message.threadId === thread.id) byId.set(message.id, message);
    }
    return resolveThreadMessagePath([...byId.values()], thread.headMessageId ?? null);
  }
}
