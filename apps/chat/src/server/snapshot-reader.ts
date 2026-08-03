import { TABLES, type ComparisonGroup, type SyncSnapshot, type Thread } from "#/domain";
import type { DataAccess } from "./data-access";
import { inflateRow, type PersistedTableName } from "./persistence-codecs";

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

export class SnapshotReader {
  constructor(private readonly access: DataAccess) {}

  /** Snapshot tables are selected from the closed codec-name union at runtime. */
  private readTable(tableName: PersistedTableName) {
    const rows = this.access.queryAll<Record<string, unknown>>(`SELECT * FROM ${tableName}`);
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      const parsed = inflateRow(tableName, row);
      result[parsed.id] = parsed;
    }
    return result;
  }

  private readRows<TableName extends PersistedTableName>(
    tableName: TableName,
    whereClause = "",
    ...params: unknown[]
  ): Array<ReturnType<typeof inflateRow<TableName>>> {
    // The table name is allowlisted by PersistedTableName; dynamic SQL keeps
    // one reader for all snapshot tables without duplicating query code.
    const rows = this.access.queryAll<Record<string, unknown>>(
      `SELECT * FROM ${tableName}${whereClause ? ` WHERE ${whereClause}` : ""}`,
      ...params,
    );
    return rows.map((row) => inflateRow(tableName, row));
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
    const rows = this.access.queryAll<Record<string, unknown>>(
      `SELECT * FROM threads ${whereSql} ORDER BY last_message_at DESC, id DESC LIMIT ?`,
      ...params,
      limit + 1,
    );
    const threads = rows.slice(0, limit).map((row) => inflateRow("threads", row));
    const comparisonGroupIds = [
      ...new Set(threads.flatMap((thread) => thread.comparisonGroupId ?? [])),
    ];
    const comparisonGroups =
      comparisonGroupIds.length > 0
        ? this.readRows(
            "comparison_groups",
            `id IN (${placeholders(comparisonGroupIds)})`,
            ...comparisonGroupIds,
          )
        : [];

    return {
      serverSeq: this.access.getLastServerSeq(),
      threads,
      comparisonGroups,
      nextCursor: rows.length > limit ? formatThreadHistoryCursor(threads.at(-1)!) : null,
    };
  }

  getThreadDetailSnapshot(
    threadId: string,
    input: ThreadDetailSnapshotInput = {},
  ): SyncSnapshot | null {
    const thread = this.readRows("threads", "id = ?", threadId)[0];
    if (!thread) return null;

    const messages = this.readRows("messages", "thread_id = ?", threadId);
    const messageIds = messages.map((message) => message.id);
    const messageWhere =
      messageIds.length > 0 ? `message_id IN (${placeholders(messageIds)})` : null;
    const comparisonGroups = thread.comparisonGroupId
      ? this.readRows("comparison_groups", "id = ?", thread.comparisonGroupId)
      : [];

    return {
      serverSeq: this.access.getLastServerSeq(),
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
    const traceRuns = this.readRows("trace_runs", "message_id = ?", messageId);
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
      serverSeq: this.access.getLastServerSeq(),
      tables: {
        [TABLES.traceRuns]: toRecordById(traceRuns),
        [TABLES.traceSpans]: toRecordById(traceSpans),
      },
    };
  }

  getSnapshot(): SyncSnapshot {
    return {
      serverSeq: this.access.getLastServerSeq(),
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
}
