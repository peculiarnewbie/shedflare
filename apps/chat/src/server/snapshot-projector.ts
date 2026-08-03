import {
  TABLES,
  type AccountSettings,
  type Attachment,
  type ComparisonGroup,
  type ExtractRun,
  type Message,
  type MessagePart,
  type SearchResult,
  type SearchRun,
  type SyncSnapshot,
  type Thread,
  type TraceRun,
  type TraceSpan,
  type Workspace,
} from "#/domain";
import { DATA_TABLES } from "./schema-helpers";
import type { ProjectionContext } from "./projection-types";

type SnapshotTableName = (typeof TABLES)[keyof typeof TABLES];

function snapshotRows<Row>(snapshot: SyncSnapshot, tableName: SnapshotTableName): Row[] {
  const table = snapshot.tables[tableName] ?? {};
  return Object.values(table) as Row[];
}

export function replaceSnapshot(snapshot: SyncSnapshot, context: ProjectionContext): void {
  // DATA_TABLES is the schema-derived allowlist for this dynamic reset.
  for (const tableName of DATA_TABLES) {
    context.sql.exec(`DELETE FROM ${tableName}`);
  }
  for (const row of snapshotRows<AccountSettings>(snapshot, TABLES.accountSettings)) {
    context.project({
      eventType: "account_settings_upserted",
      payload: { row },
    });
  }
  for (const row of snapshotRows<Workspace>(snapshot, TABLES.workspaces)) {
    context.project({ eventType: "workspace_upserted", payload: { row } });
  }
  for (const row of snapshotRows<Thread>(snapshot, TABLES.threads)) {
    context.project({ eventType: "thread_upserted", payload: { row } });
  }
  for (const row of snapshotRows<Message>(snapshot, TABLES.messages)) {
    context.project({ eventType: "message_upserted", payload: { row } });
  }
  for (const row of snapshotRows<MessagePart>(snapshot, TABLES.messageParts)) {
    context.project({
      eventType: "message_part_appended",
      payload: { row },
    });
  }
  for (const row of snapshotRows<Attachment>(snapshot, TABLES.attachments)) {
    context.project({
      eventType: "attachment_upserted",
      payload: { row },
    });
  }
  const runsByMessage = new Map<string, SearchRun[]>();
  for (const row of snapshotRows<SearchRun>(snapshot, TABLES.searchRuns)) {
    const list = runsByMessage.get(row.messageId) ?? [];
    list.push(row);
    runsByMessage.set(row.messageId, list);
  }
  for (const [messageId, rows] of runsByMessage) {
    context.project({
      eventType: "search_runs_replaced",
      payload: { messageId, rows },
    });
  }
  const resultsByMessage = new Map<string, SearchResult[]>();
  for (const row of snapshotRows<SearchResult>(snapshot, TABLES.searchResults)) {
    const list = resultsByMessage.get(row.messageId) ?? [];
    list.push(row);
    resultsByMessage.set(row.messageId, list);
  }
  for (const [messageId, rows] of resultsByMessage) {
    context.project({
      eventType: "search_results_replaced",
      payload: { messageId, rows },
    });
  }
  const extractRunsByMessage = new Map<string, ExtractRun[]>();
  for (const row of snapshotRows<ExtractRun>(snapshot, TABLES.extractRuns)) {
    const list = extractRunsByMessage.get(row.messageId) ?? [];
    list.push(row);
    extractRunsByMessage.set(row.messageId, list);
  }
  for (const [messageId, rows] of extractRunsByMessage) {
    context.project({
      eventType: "extract_runs_replaced",
      payload: { messageId, rows },
    });
  }
  for (const row of snapshotRows<TraceRun>(snapshot, TABLES.traceRuns)) {
    context.project({ eventType: "trace_run_upserted", payload: { row } });
  }
  for (const row of snapshotRows<TraceSpan>(snapshot, TABLES.traceSpans)) {
    context.project({
      eventType: "trace_span_upserted",
      payload: { row },
    });
  }
  for (const row of snapshotRows<ComparisonGroup>(snapshot, TABLES.comparisonGroups)) {
    context.project({
      eventType: "comparison_group_upserted",
      payload: { row },
    });
  }
}
