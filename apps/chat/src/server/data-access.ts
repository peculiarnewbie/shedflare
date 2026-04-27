import {
  TABLES,
  decodeAttachmentRow,
  decodeAccountSettingsRow,
  decodeExtractRunRow,
  decodeMessagePartRow,
  decodeMessageRow,
  decodeSearchResultRow,
  decodeSearchRunRow,
  decodeThreadRow,
  decodeTraceRunRow,
  decodeTraceSpanRow,
  decodeWorkspaceRow,
  nowIso,
  resolveThreadMessagePath,
  type AccountSettings,
  type Attachment,
  type Message,
  type SyncServerAck,
  type SyncServerEvent,
  type SyncEventType,
  type SyncSnapshot,
  type Thread,
  type Workspace,
} from "#/domain";
import {
  completeTextAttachment,
  getSignedAttachmentUrl,
  isImageAttachment,
  isInlineTextAttachment,
  type AppEnv,
  type ModelMessage,
} from "#/runtime";
import * as dbSchema from "#/db/schema";
import { eq } from "drizzle-orm";
import { type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { parseJson, sqlToBool } from "./sync-utils";

// ---------------------------------------------------------------------------
// Standalone normalizer functions (pure, no DB dependency)
// ---------------------------------------------------------------------------

export function normalizeWorkspace(row: Workspace, opId: string) {
  return decodeWorkspaceRow({
    ...row,
    defaultReasoningLevel: row.defaultReasoningLevel ?? "off",
    preferFreeSearch: row.preferFreeSearch ?? false,
    optimistic: false,
    opId,
    updatedAt: row.updatedAt || nowIso(),
  });
}

export function normalizeAccountSettings(row: AccountSettings, opId: string) {
  return decodeAccountSettingsRow({
    ...row,
    id: row.id || "default",
    expandReasoningByDefault: row.expandReasoningByDefault ?? false,
    showTraces: row.showTraces ?? false,
    titleGenerationModelId: row.titleGenerationModelId ?? null,
    titleGenerationModelInterleavedField: row.titleGenerationModelInterleavedField ?? null,
    optimistic: false,
    opId,
    updatedAt: row.updatedAt || nowIso(),
  });
}

export function normalizeThread(row: Thread, opId: string) {
  return decodeThreadRow({
    ...row,
    headMessageId: row.headMessageId ?? null,
    optimistic: false,
    opId,
    updatedAt: row.updatedAt || nowIso(),
    lastMessageAt: row.lastMessageAt || row.updatedAt || nowIso(),
  });
}

export function normalizeMessage(row: Message, opId: string) {
  return decodeMessageRow({
    ...row,
    parentMessageId: row.parentMessageId ?? null,
    sourceMessageId: row.sourceMessageId ?? null,
    reasoningLevel: row.reasoningLevel ?? "off",
    optimistic: false,
    opId,
    updatedAt: row.updatedAt || nowIso(),
  });
}

export function normalizeAttachment(row: Attachment, opId: string) {
  return decodeAttachmentRow({
    ...row,
    optimistic: false,
    opId,
    updatedAt: row.updatedAt || nowIso(),
  });
}

export function inflateRow(tableName: string, row: Record<string, unknown>) {
  switch (tableName) {
    case "account_settings":
      return decodeAccountSettingsRow({
        id: row.id,
        expandReasoningByDefault: sqlToBool(row.expand_reasoning_by_default),
        showTraces: sqlToBool(row.show_traces),
        titleGenerationModelId: row.title_generation_model_id ?? null,
        titleGenerationModelInterleavedField: row.title_generation_model_interleaved_field ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        optimistic: row.optimistic == null ? undefined : sqlToBool(row.optimistic),
        opId: row.op_id ?? undefined,
      });
    case "workspaces":
      return decodeWorkspaceRow({
        id: row.id,
        name: row.name,
        slug: row.slug,
        systemPrompt: row.system_prompt,
        defaultModelId: row.default_model_id,
        defaultReasoningLevel: row.default_reasoning_level,
        defaultSearchMode: sqlToBool(row.default_search_mode),
        preferFreeSearch: sqlToBool(row.prefer_free_search),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at ?? null,
        sortKey: Number(row.sort_key),
        optimistic: row.optimistic == null ? undefined : sqlToBool(row.optimistic),
        opId: row.op_id ?? undefined,
      });
    case "threads":
      return decodeThreadRow({
        id: row.id,
        workspaceId: row.workspace_id,
        title: row.title,
        pinned: sqlToBool(row.pinned),
        headMessageId: row.head_message_id ?? null,
        modelId: row.model_id ?? null,
        reasoningLevel: row.reasoning_level ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at,
        archivedAt: row.archived_at ?? null,
        optimistic: row.optimistic == null ? undefined : sqlToBool(row.optimistic),
        opId: row.op_id ?? undefined,
      });
    case "messages":
      return decodeMessageRow({
        id: row.id,
        threadId: row.thread_id,
        parentMessageId: row.parent_message_id ?? null,
        sourceMessageId: row.source_message_id ?? null,
        role: row.role,
        status: row.status,
        modelId: row.model_id,
        reasoningLevel: row.reasoning_level,
        text: row.text,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        errorCode: row.error_code ?? null,
        errorMessage: row.error_message ?? null,
        searchEnabled: sqlToBool(row.search_enabled),
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
        ttftMs: row.ttft_ms == null ? null : Number(row.ttft_ms),
        promptTokens: row.prompt_tokens == null ? null : Number(row.prompt_tokens),
        completionTokens: row.completion_tokens == null ? null : Number(row.completion_tokens),
        optimistic: row.optimistic == null ? undefined : sqlToBool(row.optimistic),
        opId: row.op_id ?? undefined,
      });
    case "message_parts":
      return decodeMessagePartRow({
        id: row.id,
        messageId: row.message_id,
        seq: Number(row.seq),
        kind: row.kind,
        text: row.text,
        json: row.json ?? null,
      });
    case "attachments":
      return decodeAttachmentRow({
        id: row.id,
        threadId: row.thread_id,
        messageId: row.message_id ?? null,
        objectKey: row.object_key,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: Number(row.size_bytes),
        sha256: row.sha256 ?? null,
        width: row.width == null ? null : Number(row.width),
        height: row.height == null ? null : Number(row.height),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        optimistic: row.optimistic == null ? undefined : sqlToBool(row.optimistic),
        opId: row.op_id ?? undefined,
      });
    case "search_runs":
      return decodeSearchRunRow({
        id: row.id,
        messageId: row.message_id,
        query: row.query,
        status: row.status,
        step: Number(row.step),
        numResults: Number(row.num_results),
        resultCount: Number(row.result_count),
        previewText: row.preview_text,
        errorMessage: row.error_message ?? null,
        mode: row.mode ?? undefined,
        createdAt: row.created_at,
      });
    case "search_results":
      return decodeSearchResultRow({
        id: row.id,
        searchRunId: row.search_run_id,
        messageId: row.message_id,
        url: row.url,
        title: row.title,
        snippet: row.snippet,
        publishedAt: row.published_at ?? null,
        domain: row.domain,
        score: Number(row.score),
      });
    case "extract_runs":
      return decodeExtractRunRow({
        id: row.id,
        messageId: row.message_id,
        url: row.url,
        status: row.status,
        step: Number(row.step),
        charCount: Number(row.char_count),
        originalLength: row.original_length == null ? null : Number(row.original_length),
        truncated: sqlToBool(row.truncated),
        errorMessage: row.error_message ?? null,
        createdAt: row.created_at,
      });
    case "trace_runs":
      return decodeTraceRunRow({
        id: row.id,
        messageId: row.message_id ?? null,
        threadId: row.thread_id ?? null,
        workspaceId: row.workspace_id ?? null,
        traceId: row.trace_id,
        rootSpanId: row.root_span_id,
        modelId: row.model_id ?? null,
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at ?? null,
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
        errorCode: row.error_code ?? null,
        errorMessage: row.error_message ?? null,
        attrsJson: row.attrs_json,
      });
    case "trace_spans":
      return decodeTraceSpanRow({
        id: row.id,
        traceRunId: row.trace_run_id ?? null,
        traceId: row.trace_id,
        parentSpanId: row.parent_span_id ?? null,
        messageId: row.message_id ?? null,
        name: row.name,
        kind: row.kind,
        status: row.status,
        startedAt: row.started_at,
        endedAt: row.ended_at ?? null,
        durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
        errorCode: row.error_code ?? null,
        errorMessage: row.error_message ?? null,
        attrsJson: row.attrs_json,
        eventsJson: row.events_json,
      });
    default:
      throw new Error(`Unknown snapshot table ${tableName}`);
  }
}

// ---------------------------------------------------------------------------
// DataAccess – bundles Drizzle + raw SQL queries for the sync engine
// ---------------------------------------------------------------------------

export class DataAccess {
  constructor(
    public readonly db: DrizzleSqliteDODatabase<typeof dbSchema>,
    private readonly sqlExec: (query: string, ...params: any[]) => { toArray(): any[] },
  ) {}

  exec(query: string, ...params: any[]) {
    return this.sqlExec(query, ...params);
  }

  queryOne<T extends Record<string, unknown>>(query: string, ...params: any[]) {
    const rows = this.exec(query, ...params).toArray() as T[];
    return rows[0] ?? null;
  }

  queryAll<T extends Record<string, unknown>>(query: string, ...params: any[]) {
    return this.exec(query, ...params).toArray() as T[];
  }

  getLastServerSeq() {
    const row = this.queryOne<{ seq: number }>("SELECT coalesce(max(seq), 0) as seq FROM events");
    return Number(row?.seq ?? 0);
  }

  getOldestEventSeq(): number {
    const row = this.queryOne<{ min_seq: number | null }>(`SELECT MIN(seq) as min_seq FROM events`);
    return row?.min_seq ?? 0;
  }

  getEventsAfter(afterSeq: number) {
    return this.queryAll<{
      seq: number;
      event_id: string;
      op_id: string | null;
      type: string;
      payload_json: string;
    }>(
      `SELECT seq, event_id, op_id, type, payload_json FROM events WHERE seq > ? ORDER BY seq ASC`,
      afterSeq,
    ).map((row) => ({
      type: "event",
      serverSeq: Number(row.seq),
      eventId: String(row.event_id),
      eventType: row.type as SyncEventType,
      payload: parseJson(row.payload_json),
      causedByOpId: row.op_id,
    })) as SyncServerEvent[];
  }

  getCommandAck(opId: string) {
    const row = this.db
      .select({ responseJson: dbSchema.commands.responseJson })
      .from(dbSchema.commands)
      .where(eq(dbSchema.commands.opId, opId))
      .get();
    return row?.responseJson ? parseJson<SyncServerAck>(row.responseJson) : null;
  }

  getWorkspace(id: string) {
    return (
      this.db.select().from(dbSchema.workspaces).where(eq(dbSchema.workspaces.id, id)).get() ?? null
    );
  }

  getAccountSettings() {
    return (
      this.db
        .select()
        .from(dbSchema.accountSettings)
        .where(eq(dbSchema.accountSettings.id, "default"))
        .get() ?? null
    );
  }

  getThread(id: string) {
    return this.db.select().from(dbSchema.threads).where(eq(dbSchema.threads.id, id)).get() ?? null;
  }

  getMessage(id: string) {
    const row = this.db.select().from(dbSchema.messages).where(eq(dbSchema.messages.id, id)).get();
    return row ? decodeMessageRow(row) : null;
  }

  getAttachment(id: string) {
    const row = this.queryOne<Record<string, unknown>>(
      `SELECT * FROM attachments WHERE id = ?`,
      id,
    );
    return row ? (inflateRow("attachments", row) as Attachment) : null;
  }

  getThreadMessages(
    thread: Pick<Thread, "id" | "headMessageId">,
    additionalMessages: Message[] = [],
  ) {
    const byId = new Map<string, Message>();
    const rows = this.queryAll<Record<string, unknown>>(
      `SELECT * FROM messages WHERE thread_id = ?`,
      thread.id,
    );
    for (const row of rows) {
      const message = inflateRow("messages", row) as Message;
      byId.set(message.id, message);
    }
    for (const message of additionalMessages) {
      if (message.threadId === thread.id) byId.set(message.id, message);
    }
    return resolveThreadMessagePath([...byId.values()], thread.headMessageId ?? null);
  }

  readTable(tableName: string) {
    const rows = this.queryAll<Record<string, unknown>>(`SELECT * FROM ${tableName}`);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      const parsed = inflateRow(tableName, row) as { id: string };
      result[parsed.id] = parsed;
    }
    return result;
  }

  getSnapshot(): SyncSnapshot {
    return {
      serverSeq: this.getLastServerSeq(),
      tables: {
        [TABLES.workspaces]: this.readTable("workspaces"),
        [TABLES.accountSettings]: this.readTable("account_settings"),
        [TABLES.threads]: this.readTable("threads"),
        [TABLES.messages]: this.readTable("messages"),
        [TABLES.messageParts]: this.readTable("message_parts"),
        [TABLES.attachments]: this.readTable("attachments"),
        [TABLES.searchRuns]: this.readTable("search_runs"),
        [TABLES.searchResults]: this.readTable("search_results"),
        [TABLES.extractRuns]: this.readTable("extract_runs"),
        [TABLES.traceRuns]: this.readTable("trace_runs"),
        [TABLES.traceSpans]: this.readTable("trace_spans"),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// buildModelMessages – resolves attachments, produces TanStack AI messages
// ---------------------------------------------------------------------------

export async function buildModelMessages(
  workspaceId: string,
  threadMessages: Message[],
  access: DataAccess,
  env: AppEnv,
): Promise<{ messages: ModelMessage[]; systemPrompts: string[] }> {
  const workspace = access.getWorkspace(workspaceId) ?? undefined;
  const threadId = threadMessages[0]?.threadId;
  const attachmentRows = threadId
    ? access.queryAll<Record<string, unknown>>(
        `SELECT * FROM attachments WHERE thread_id = ? AND status = ?`,
        threadId,
        "ready",
      )
    : [];
  const attachments = attachmentRows.map((row) => inflateRow("attachments", row) as Attachment);

  const systemPrompts: string[] = [];
  if (workspace?.systemPrompt) {
    systemPrompts.push(workspace.systemPrompt);
  }

  const messages: ModelMessage[] = [];

  for (const message of threadMessages) {
    if (message.status === "failed" || message.status === "cancelled") continue;

    const contentParts: Array<string | { type: "image"; source: { type: "url"; value: string } }> =
      [];

    if (message.text?.trim()) {
      contentParts.push(message.text);
    }

    if (message.role === "user") {
      const tasks = attachments
        .filter((attachment) => attachment.messageId === message.id)
        .map(async (attachment) => {
          if (isImageAttachment(attachment.mimeType)) {
            const signedUrl = await getSignedAttachmentUrl(env, attachment.objectKey);
            return {
              type: "image" as const,
              source: { type: "url" as const, value: signedUrl },
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
