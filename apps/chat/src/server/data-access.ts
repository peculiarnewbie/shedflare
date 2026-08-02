import {
  TABLES,
  clampSearchesPerTurn,
  decodeAttachmentRow,
  decodeAccountSettingsRow,
  decodeComparisonGroupRow,
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
  type ComparisonGroup,
  type Message,
  type SyncSnapshot,
  type Thread,
  type Workspace,
} from "#/domain";
import {
  completeTextAttachment,
  getInlineAttachment,
  isImageAttachment,
  isInlineTextAttachment,
  type AppEnv,
  type ModelMessage,
} from "#/runtime";
import * as dbSchema from "#/db/schema";
import { eq } from "drizzle-orm";
import { DataAccess as SyncDataAccess } from "@shedflare/sync-protocol";
import { sqlToBool } from "./sync-utils";
import { type EffectDatabase } from "./effect-database";

type ThreadHistoryCursor = {
  lastMessageAt: string;
  threadId: string;
};

export type ThreadSummaryPage = {
  serverSeq: number;
  threads: Thread[];
  comparisonGroups: ComparisonGroup[];
  nextCursor: string | null;
};

export type ThreadSummaryPageInput = {
  workspaceId?: string | null;
  before?: string | null;
  limit?: number;
  includeArchived?: boolean;
};

export type ThreadDetailSnapshotInput = {
  includeSearch?: boolean;
  includeTrace?: boolean;
};

export type ChatBackupEvent = {
  seq: number;
  eventId: string;
  opId: string | null;
  type: string;
  payloadJson: string;
  createdAt: string;
};

export type ChatBackupCommand = {
  opId: string;
  type: string;
  status: string;
  responseJson: string | null;
  createdAt: string;
  ackedSeq: number | null;
};

export type ChatBackup = {
  version: 1;
  app: "chat";
  createdAt: string;
  protocolVersion: string;
  serverSeq: number;
  snapshot: SyncSnapshot;
  events: ChatBackupEvent[];
  commands: ChatBackupCommand[];
};

const DEFAULT_THREAD_HISTORY_LIMIT = 50;
const MAX_THREAD_HISTORY_LIMIT = 100;

function clampThreadHistoryLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_THREAD_HISTORY_LIMIT;
  return Math.min(
    MAX_THREAD_HISTORY_LIMIT,
    Math.max(1, Math.trunc(value ?? DEFAULT_THREAD_HISTORY_LIMIT)),
  );
}

function parseThreadHistoryCursor(value: string | null | undefined): ThreadHistoryCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.lastMessageAt !== "string" || typeof parsed.threadId !== "string") {
      return null;
    }
    return { lastMessageAt: parsed.lastMessageAt, threadId: parsed.threadId };
  } catch {
    return null;
  }
}

function formatThreadHistoryCursor(thread: Thread): string {
  return JSON.stringify({ lastMessageAt: thread.lastMessageAt, threadId: thread.id });
}

function toRecordById<T extends { id: string }>(rows: T[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const row of rows) result[row.id] = row;
  return result;
}

function placeholders(values: readonly unknown[]) {
  return values.map(() => "?").join(",");
}

// ---------------------------------------------------------------------------
// Standalone normalizer functions (pure, no DB dependency)
// ---------------------------------------------------------------------------

export function normalizeWorkspace(row: Workspace, opId: string) {
  return decodeWorkspaceRow({
    ...row,
    defaultReasoningLevel: row.defaultReasoningLevel ?? "off",
    defaultSearchLimit: clampSearchesPerTurn(row.defaultSearchLimit),
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

export function normalizeThread(row: Partial<Thread>, opId: string) {
  return decodeThreadRow({
    ...row,
    headMessageId: row.headMessageId ?? null,
    searchEnabled: row.searchEnabled ?? null,
    searchLimit: row.searchLimit == null ? null : clampSearchesPerTurn(row.searchLimit),
    forkedFromThreadId: row.forkedFromThreadId ?? null,
    forkedFromMessageId: row.forkedFromMessageId ?? null,
    threadType: row.threadType ?? null,
    comparisonGroupId: row.comparisonGroupId ?? null,
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

const INFLATE_DISPATCH: Record<string, (row: Record<string, unknown>) => unknown> = {
  account_settings: (row) =>
    decodeAccountSettingsRow({
      id: row.id,
      expandReasoningByDefault: sqlToBool(row.expand_reasoning_by_default),
      showTraces: sqlToBool(row.show_traces),
      titleGenerationModelId: row.title_generation_model_id ?? null,
      titleGenerationModelInterleavedField: row.title_generation_model_interleaved_field ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      optimistic: row.optimistic == null ? undefined : sqlToBool(row.optimistic),
      opId: row.op_id ?? undefined,
    }),
  workspaces: (row) =>
    decodeWorkspaceRow({
      id: row.id,
      name: row.name,
      slug: row.slug,
      systemPrompt: row.system_prompt,
      defaultModelId: row.default_model_id,
      defaultReasoningLevel: row.default_reasoning_level,
      defaultSearchMode: sqlToBool(row.default_search_mode),
      defaultSearchLimit: clampSearchesPerTurn(row.default_search_limit),
      preferFreeSearch: sqlToBool(row.prefer_free_search),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at ?? null,
      sortKey: Number(row.sort_key),
      optimistic: row.optimistic == null ? undefined : sqlToBool(row.optimistic),
      opId: row.op_id ?? undefined,
    }),
  threads: (row) =>
    decodeThreadRow({
      id: row.id,
      workspaceId: row.workspace_id,
      title: row.title,
      pinned: sqlToBool(row.pinned),
      headMessageId: row.head_message_id ?? null,
      modelId: row.model_id ?? null,
      reasoningLevel: row.reasoning_level ?? null,
      searchEnabled: row.search_enabled == null ? null : sqlToBool(row.search_enabled),
      searchLimit: row.search_limit == null ? null : clampSearchesPerTurn(row.search_limit),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at,
      forkedFromThreadId: row.forked_from_thread_id ?? null,
      forkedFromMessageId: row.forked_from_message_id ?? null,
      threadType: row.thread_type ?? null,
      comparisonGroupId: row.comparison_group_id ?? null,
      archivedAt: row.archived_at ?? null,
      optimistic: row.optimistic == null ? undefined : sqlToBool(row.optimistic),
      opId: row.op_id ?? undefined,
    }),
  messages: (row) =>
    decodeMessageRow({
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
    }),
  message_parts: (row) =>
    decodeMessagePartRow({
      id: row.id,
      messageId: row.message_id,
      seq: Number(row.seq),
      kind: row.kind,
      text: row.text,
      json: row.json ?? null,
    }),
  attachments: (row) =>
    decodeAttachmentRow({
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
    }),
  search_runs: (row) =>
    decodeSearchRunRow({
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
    }),
  search_results: (row) =>
    decodeSearchResultRow({
      id: row.id,
      searchRunId: row.search_run_id,
      messageId: row.message_id,
      url: row.url,
      title: row.title,
      snippet: row.snippet,
      publishedAt: row.published_at ?? null,
      domain: row.domain,
      score: Number(row.score),
    }),
  extract_runs: (row) =>
    decodeExtractRunRow({
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
    }),
  trace_runs: (row) =>
    decodeTraceRunRow({
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
    }),
  trace_spans: (row) =>
    decodeTraceSpanRow({
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
    }),
  comparison_groups: (row) =>
    decodeComparisonGroupRow({
      id: row.id,
      workspaceId: row.workspace_id,
      threadIds: row.thread_ids,
      createdAt: row.created_at,
      optimistic: row.optimistic == null ? undefined : sqlToBool(row.optimistic),
      opId: row.op_id ?? undefined,
    }),
};

export function inflateRow(tableName: string, row: Record<string, unknown>) {
  const fn = INFLATE_DISPATCH[tableName];
  if (!fn) throw new Error(`Unknown snapshot table ${tableName}`);
  return fn(row);
}

// ---------------------------------------------------------------------------
// DataAccess – bundles Drizzle + raw SQL queries for the sync engine
// ---------------------------------------------------------------------------

export class DataAccess {
  constructor(
    public readonly syncAccess: SyncDataAccess,
    public readonly database: EffectDatabase,
  ) {}

  get db() {
    return this.database.drizzle;
  }

  exec(query: string, ...params: any[]) {
    return this.database.runSync(this.syncAccess.exec(query, ...params));
  }

  queryOne<T extends Record<string, unknown>>(query: string, ...params: any[]) {
    return this.database.runSync(this.syncAccess.queryOne<T>(query, ...params));
  }

  queryAll<T extends Record<string, unknown>>(query: string, ...params: any[]) {
    return this.database.runSync(this.syncAccess.queryAll<T>(query, ...params));
  }

  getLastServerSeq() {
    return this.database.runSync(this.syncAccess.getLastServerSeq());
  }

  getOldestEventSeq(): number {
    return this.database.runSync(this.syncAccess.getOldestEventSeq());
  }

  getEventsAfter(afterSeq: number) {
    return this.database.runSync(this.syncAccess.getEventsAfter(afterSeq));
  }

  getCommandAck(opId: string) {
    return this.database.runSync(this.syncAccess.getCommandAck(opId));
  }

  getWorkspace(id: string) {
    return (
      this.database.runSync(
        this.db.select().from(dbSchema.workspaces).where(eq(dbSchema.workspaces.id, id)).get(),
      ) ?? null
    );
  }

  getAccountSettings() {
    return (
      this.database.runSync(
        this.db
          .select()
          .from(dbSchema.accountSettings)
          .where(eq(dbSchema.accountSettings.id, "default"))
          .get(),
      ) ?? null
    );
  }

  getThread(id: string) {
    return (
      this.database.runSync(
        this.db.select().from(dbSchema.threads).where(eq(dbSchema.threads.id, id)).get(),
      ) ?? null
    );
  }

  deleteThreadCascade(id: string) {
    const messageIds = this.queryAll<{ id: string }>(
      `SELECT id FROM messages WHERE thread_id = ?`,
      id,
    ).map((r) => r.id);

    if (messageIds.length > 0) {
      const placeholders = messageIds.map(() => "?").join(",");
      this.exec(
        `DELETE FROM trace_spans WHERE trace_run_id IN (SELECT id FROM trace_runs WHERE message_id IN (${placeholders}))`,
        ...messageIds,
      );
      this.exec(`DELETE FROM trace_runs WHERE message_id IN (${placeholders})`, ...messageIds);
      this.exec(`DELETE FROM search_results WHERE message_id IN (${placeholders})`, ...messageIds);
      this.exec(`DELETE FROM search_runs WHERE message_id IN (${placeholders})`, ...messageIds);
      this.exec(`DELETE FROM extract_runs WHERE message_id IN (${placeholders})`, ...messageIds);
      this.exec(`DELETE FROM message_parts WHERE message_id IN (${placeholders})`, ...messageIds);
      this.exec(`DELETE FROM messages WHERE id IN (${placeholders})`, ...messageIds);
    }

    this.exec(`DELETE FROM attachments WHERE thread_id = ?`, id);
    this.exec(`DELETE FROM threads WHERE id = ?`, id);
  }

  getMessage(id: string) {
    const row = this.database.runSync(
      this.db.select().from(dbSchema.messages).where(eq(dbSchema.messages.id, id)).get(),
    );
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

  readRows<T extends { id: string }>(
    tableName: string,
    whereClause = "",
    ...params: unknown[]
  ): T[] {
    const rows = this.queryAll<Record<string, unknown>>(
      `SELECT * FROM ${tableName}${whereClause ? ` WHERE ${whereClause}` : ""}`,
      ...params,
    );
    return rows.map((row) => inflateRow(tableName, row) as T);
  }

  getThreadSummaryPage(input: ThreadSummaryPageInput = {}): ThreadSummaryPage {
    const limit = clampThreadHistoryLimit(input.limit);
    const cursor = parseThreadHistoryCursor(input.before);
    const where: string[] = [];
    const params: unknown[] = [];

    if (input.workspaceId) {
      where.push("workspace_id = ?");
      params.push(input.workspaceId);
    }
    if (!input.includeArchived) {
      where.push("archived_at IS NULL");
    }
    if (cursor) {
      where.push("(last_message_at < ? OR (last_message_at = ? AND id < ?))");
      params.push(cursor.lastMessageAt, cursor.lastMessageAt, cursor.threadId);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const rows = this.queryAll<Record<string, unknown>>(
      `SELECT * FROM threads ${whereSql} ORDER BY last_message_at DESC, id DESC LIMIT ?`,
      ...params,
      limit + 1,
    );
    const threads = rows.slice(0, limit).map((row) => inflateRow("threads", row) as Thread);
    const comparisonGroupIds = [
      ...new Set(threads.flatMap((thread) => thread.comparisonGroupId ?? [])),
    ];
    const comparisonGroups =
      comparisonGroupIds.length > 0
        ? this.readRows<ComparisonGroup>(
            "comparison_groups",
            `id IN (${placeholders(comparisonGroupIds)})`,
            ...comparisonGroupIds,
          )
        : [];

    return {
      serverSeq: this.getLastServerSeq(),
      threads,
      comparisonGroups,
      nextCursor: rows.length > limit ? formatThreadHistoryCursor(threads.at(-1)!) : null,
    };
  }

  getThreadDetailSnapshot(
    threadId: string,
    input: ThreadDetailSnapshotInput = {},
  ): SyncSnapshot | null {
    const thread = this.readRows<Thread>("threads", "id = ?", threadId)[0];
    if (!thread) return null;

    const messages = this.readRows<Message>("messages", "thread_id = ?", threadId);
    const messageIds = messages.map((message) => message.id);
    const messageWhere =
      messageIds.length > 0 ? `message_id IN (${placeholders(messageIds)})` : null;
    const comparisonGroups = thread.comparisonGroupId
      ? this.readRows<ComparisonGroup>("comparison_groups", "id = ?", thread.comparisonGroupId)
      : [];

    return {
      serverSeq: this.getLastServerSeq(),
      tables: {
        [TABLES.threads]: toRecordById([thread]),
        [TABLES.messages]: toRecordById(messages),
        [TABLES.messageParts]: messageWhere
          ? toRecordById(this.readRows("message_parts", messageWhere, ...messageIds))
          : {},
        [TABLES.attachments]: toRecordById(this.readRows("attachments", "thread_id = ?", threadId)),
        [TABLES.searchRuns]:
          input.includeSearch !== false && messageWhere
            ? toRecordById(this.readRows("search_runs", messageWhere, ...messageIds))
            : {},
        [TABLES.searchResults]:
          input.includeSearch !== false && messageWhere
            ? toRecordById(this.readRows("search_results", messageWhere, ...messageIds))
            : {},
        [TABLES.extractRuns]:
          input.includeSearch !== false && messageWhere
            ? toRecordById(this.readRows("extract_runs", messageWhere, ...messageIds))
            : {},
        [TABLES.traceRuns]:
          input.includeTrace && messageWhere
            ? toRecordById(this.readRows("trace_runs", messageWhere, ...messageIds))
            : {},
        [TABLES.traceSpans]:
          input.includeTrace && messageWhere
            ? toRecordById(this.readRows("trace_spans", messageWhere, ...messageIds))
            : {},
        [TABLES.comparisonGroups]: toRecordById(comparisonGroups),
      },
    };
  }

  getMessageTraceSnapshot(messageId: string): SyncSnapshot {
    const traceRuns = this.readRows<{ id: string; traceId: string }>(
      "trace_runs",
      "message_id = ?",
      messageId,
    );
    const traceRunIds = traceRuns.map((run) => run.id);
    const traceSpans =
      traceRunIds.length > 0
        ? this.readRows(
            "trace_spans",
            `(message_id = ? OR trace_run_id IN (${placeholders(traceRunIds)}))`,
            messageId,
            ...traceRunIds,
          )
        : this.readRows("trace_spans", "message_id = ?", messageId);

    return {
      serverSeq: this.getLastServerSeq(),
      tables: {
        [TABLES.traceRuns]: toRecordById(traceRuns),
        [TABLES.traceSpans]: toRecordById(traceSpans),
      },
    };
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
        [TABLES.comparisonGroups]: this.readTable("comparison_groups"),
      },
    };
  }

  getBackup(input: { createdAt: string; protocolVersion: string }): ChatBackup {
    const snapshot = this.getSnapshot();
    const events = this.queryAll<ChatBackupEvent>(
      `SELECT seq, event_id AS eventId, op_id AS opId, type, payload_json AS payloadJson, created_at AS createdAt
       FROM events
       ORDER BY seq ASC`,
    );
    const commands = this.queryAll<ChatBackupCommand>(
      `SELECT op_id AS opId, type, status, response_json AS responseJson, created_at AS createdAt, acked_seq AS ackedSeq
       FROM commands
       ORDER BY created_at ASC, op_id ASC`,
    );

    return {
      version: 1,
      app: "chat",
      createdAt: input.createdAt,
      protocolVersion: input.protocolVersion,
      serverSeq: snapshot.serverSeq ?? this.getLastServerSeq(),
      snapshot,
      events,
      commands,
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
