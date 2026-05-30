import {
  TABLES,
  type AccountSettings,
  type Attachment,
  type ExtractRun,
  type Message,
  type SearchResult,
  type SearchRun,
  type SyncEventPayloadMap,
  type SyncEventType,
  type SyncServerEvent,
  type SyncSnapshot,
  type Thread,
  type TraceRun,
  type TraceSpan,
  type Workspace,
} from "#/domain";
import { DataAccess as SyncDataAccess, SyncEventStore } from "@shedflare/sync-protocol";
import { boolToSql } from "./sync-utils";
import { DATA_TABLES } from "./schema";
import { type DataAccess } from "./data-access";

export class EventStore {
  private readonly syncEventStore: SyncEventStore;

  constructor(private readonly access: DataAccess) {
    const syncAccess: SyncDataAccess = access.syncAccess;
    this.syncEventStore = new SyncEventStore(syncAccess, (eventType, payload) => {
      this.applyEventToMaterializedState({ eventType: eventType as SyncEventType, payload });
    });
  }

  insertEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ): SyncServerEvent<T> {
    const event = this.syncEventStore.insertEvent(opId, eventType, payload);
    return event as SyncServerEvent<T>;
  }

  async appendServerEvent<T extends SyncEventType>(
    opId: string | null,
    eventType: T,
    payload: SyncEventPayloadMap[T],
  ): Promise<SyncServerEvent<T>> {
    return this.access.db.transaction(() => this.insertEvent(opId, eventType, payload));
  }

  replaceSnapshot(snapshot: SyncSnapshot) {
    this.access.db.transaction(() => {
      for (const tableName of DATA_TABLES) {
        this.access.exec(`DELETE FROM ${tableName}`);
      }
      const tables = (snapshot.tables ?? {}) as Record<string, Record<string, any> | undefined>;
      for (const row of Object.values<AccountSettings>(tables[TABLES.accountSettings] ?? {})) {
        this.applyEventToMaterializedState({
          eventType: "account_settings_upserted",
          payload: { row },
        });
      }
      for (const row of Object.values<Workspace>(tables[TABLES.workspaces] ?? {})) {
        this.applyEventToMaterializedState({ eventType: "workspace_upserted", payload: { row } });
      }
      for (const row of Object.values<Thread>(tables[TABLES.threads] ?? {})) {
        this.applyEventToMaterializedState({ eventType: "thread_upserted", payload: { row } });
      }
      for (const row of Object.values<Message>(tables[TABLES.messages] ?? {})) {
        this.applyEventToMaterializedState({ eventType: "message_upserted", payload: { row } });
      }
      for (const row of Object.values<any>(tables[TABLES.messageParts] ?? {})) {
        this.applyEventToMaterializedState({
          eventType: "message_part_appended",
          payload: { row },
        });
      }
      for (const row of Object.values<Attachment>(tables[TABLES.attachments] ?? {})) {
        this.applyEventToMaterializedState({
          eventType: "attachment_upserted",
          payload: { row },
        });
      }
      const runsByMessage = new Map<string, SearchRun[]>();
      for (const row of Object.values<SearchRun>(tables[TABLES.searchRuns] ?? {})) {
        const list = runsByMessage.get(row.messageId) ?? [];
        list.push(row);
        runsByMessage.set(row.messageId, list);
      }
      for (const [messageId, rows] of runsByMessage) {
        this.applyEventToMaterializedState({
          eventType: "search_runs_replaced",
          payload: { messageId, rows },
        });
      }
      const resultsByMessage = new Map<string, SearchResult[]>();
      for (const row of Object.values<SearchResult>(tables[TABLES.searchResults] ?? {})) {
        const list = resultsByMessage.get(row.messageId) ?? [];
        list.push(row);
        resultsByMessage.set(row.messageId, list);
      }
      for (const [messageId, rows] of resultsByMessage) {
        this.applyEventToMaterializedState({
          eventType: "search_results_replaced",
          payload: { messageId, rows },
        });
      }
      const extractRunsByMessage = new Map<string, ExtractRun[]>();
      for (const row of Object.values<ExtractRun>(tables[TABLES.extractRuns] ?? {})) {
        const list = extractRunsByMessage.get(row.messageId) ?? [];
        list.push(row);
        extractRunsByMessage.set(row.messageId, list);
      }
      for (const [messageId, rows] of extractRunsByMessage) {
        this.applyEventToMaterializedState({
          eventType: "extract_runs_replaced",
          payload: { messageId, rows },
        });
      }
      for (const row of Object.values<TraceRun>(tables[TABLES.traceRuns] ?? {})) {
        this.applyEventToMaterializedState({ eventType: "trace_run_upserted", payload: { row } });
      }
      for (const row of Object.values<TraceSpan>(tables[TABLES.traceSpans] ?? {})) {
        this.applyEventToMaterializedState({
          eventType: "trace_span_upserted",
          payload: { row },
        });
      }
    });
  }

  private applyEventToMaterializedState(input: { eventType: SyncEventType; payload: any }) {
    const { eventType, payload } = input;
    switch (eventType) {
      case "account_settings_upserted": {
        const row = payload.row;
        this.access.exec(
          `INSERT OR REPLACE INTO account_settings (id, expand_reasoning_by_default, show_traces, title_generation_model_id, title_generation_model_interleaved_field, created_at, updated_at, optimistic, op_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id,
          boolToSql(row.expandReasoningByDefault),
          boolToSql(row.showTraces),
          row.titleGenerationModelId,
          row.titleGenerationModelInterleavedField,
          row.createdAt,
          row.updatedAt,
          boolToSql(row.optimistic),
          row.opId ?? null,
        );
        break;
      }
      case "workspace_upserted": {
        const row = payload.row;
        this.access.exec(
          `INSERT OR REPLACE INTO workspaces (id, name, slug, system_prompt, default_model_id, default_reasoning_level, default_search_mode, default_search_limit, prefer_free_search, created_at, updated_at, archived_at, sort_key, optimistic, op_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id,
          row.name,
          row.slug,
          row.systemPrompt,
          row.defaultModelId,
          row.defaultReasoningLevel,
          boolToSql(row.defaultSearchMode),
          row.defaultSearchLimit,
          boolToSql(row.preferFreeSearch),
          row.createdAt,
          row.updatedAt,
          row.archivedAt,
          row.sortKey,
          boolToSql(row.optimistic),
          row.opId ?? null,
        );
        break;
      }
      case "workspace_archived": {
        const row = this.access.getWorkspace(payload.id);
        if (!row) break;
        this.applyEventToMaterializedState({
          eventType: "workspace_upserted",
          payload: {
            row: { ...(row as any), archivedAt: payload.archivedAt, updatedAt: payload.updatedAt },
          },
        });
        break;
      }
      case "thread_upserted": {
        const row = payload.row;
        this.access.exec(
          `INSERT OR REPLACE INTO threads (id, workspace_id, title, pinned, head_message_id, model_id, reasoning_level, search_enabled, search_limit, created_at, updated_at, last_message_at, archived_at, forked_from_thread_id, forked_from_message_id, optimistic, op_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id,
          row.workspaceId,
          row.title,
          boolToSql(row.pinned),
          row.headMessageId,
          row.modelId,
          row.reasoningLevel,
          row.searchEnabled == null ? null : boolToSql(row.searchEnabled),
          row.searchLimit,
          row.createdAt,
          row.updatedAt,
          row.lastMessageAt,
          row.archivedAt,
          row.forkedFromThreadId ?? null,
          row.forkedFromMessageId ?? null,
          boolToSql(row.optimistic),
          row.opId ?? null,
        );
        break;
      }
      case "thread_archived": {
        const row = this.access.getThread(payload.id);
        if (!row) break;
        this.applyEventToMaterializedState({
          eventType: "thread_upserted",
          payload: {
            row: { ...(row as any), archivedAt: payload.archivedAt, updatedAt: payload.updatedAt },
          },
        });
        break;
      }
      case "message_upserted": {
        const row = payload.row;
        this.access.exec(
          `INSERT OR REPLACE INTO messages (id, thread_id, parent_message_id, source_message_id, role, status, model_id, reasoning_level, text, created_at, updated_at, error_code, error_message, search_enabled, duration_ms, ttft_ms, prompt_tokens, completion_tokens, optimistic, op_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id,
          row.threadId,
          row.parentMessageId,
          row.sourceMessageId,
          row.role,
          row.status,
          row.modelId,
          row.reasoningLevel,
          row.text,
          row.createdAt,
          row.updatedAt,
          row.errorCode,
          row.errorMessage,
          boolToSql(row.searchEnabled),
          row.durationMs,
          row.ttftMs,
          row.promptTokens,
          row.completionTokens,
          boolToSql(row.optimistic),
          row.opId ?? null,
        );
        break;
      }
      case "message_delta": {
        const row = this.access.getMessage(payload.messageId);
        if (!row) break;
        this.applyEventToMaterializedState({
          eventType: "message_upserted",
          payload: {
            row: {
              ...(row as any),
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
        const row = this.access.getMessage(payload.messageId);
        if (!row) break;
        this.applyEventToMaterializedState({
          eventType: "message_upserted",
          payload: {
            row: {
              ...(row as any),
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
        const row = this.access.getMessage(payload.messageId);
        if (!row) break;
        this.applyEventToMaterializedState({
          eventType: "message_upserted",
          payload: {
            row: {
              ...(row as any),
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
        this.access.exec(
          `INSERT OR REPLACE INTO message_parts (id, message_id, seq, kind, text, json)
           VALUES (?, ?, ?, ?, ?, ?)`,
          row.id,
          row.messageId,
          row.seq,
          row.kind,
          row.text,
          row.json,
        );
        break;
      }
      case "attachment_upserted": {
        const row = payload.row;
        this.access.exec(
          `INSERT OR REPLACE INTO attachments (id, thread_id, message_id, object_key, file_name, mime_type, size_bytes, sha256, width, height, status, created_at, updated_at, optimistic, op_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id,
          row.threadId,
          row.messageId,
          row.objectKey,
          row.fileName,
          row.mimeType,
          row.sizeBytes,
          row.sha256,
          row.width,
          row.height,
          row.status,
          row.createdAt,
          row.updatedAt,
          boolToSql(row.optimistic),
          row.opId ?? null,
        );
        break;
      }
      case "attachment_deleted": {
        this.access.exec(`DELETE FROM attachments WHERE id = ?`, payload.id);
        break;
      }
      case "thread_deleted": {
        this.access.deleteThreadCascade(payload.id);
        break;
      }
      case "search_runs_replaced": {
        this.access.exec(`DELETE FROM search_runs WHERE message_id = ?`, payload.messageId);
        for (const row of payload.rows) {
          this.access.exec(
            `INSERT OR REPLACE INTO search_runs (id, message_id, query, status, step, num_results, result_count, preview_text, error_message, mode, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            row.id,
            row.messageId,
            row.query,
            row.status,
            row.step,
            row.numResults,
            row.resultCount,
            row.previewText,
            row.errorMessage,
            row.mode ?? null,
            row.createdAt,
          );
        }
        break;
      }
      case "search_results_replaced": {
        this.access.exec(`DELETE FROM search_results WHERE message_id = ?`, payload.messageId);
        for (const row of payload.rows) {
          this.access.exec(
            `INSERT OR REPLACE INTO search_results (id, message_id, search_run_id, url, title, snippet, published_at, domain, score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            row.id,
            row.messageId,
            row.searchRunId,
            row.url,
            row.title,
            row.snippet,
            row.publishedAt,
            row.domain,
            row.score,
          );
        }
        break;
      }
      case "extract_runs_replaced": {
        this.access.exec(`DELETE FROM extract_runs WHERE message_id = ?`, payload.messageId);
        for (const row of payload.rows) {
          this.access.exec(
            `INSERT OR REPLACE INTO extract_runs (id, message_id, url, status, step, char_count, original_length, truncated, error_message, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            row.id,
            row.messageId,
            row.url,
            row.status,
            row.step,
            row.charCount,
            row.originalLength,
            boolToSql(row.truncated),
            row.errorMessage,
            row.createdAt,
          );
        }
        break;
      }
      case "trace_run_upserted": {
        const row = payload.row;
        this.access.exec(
          `INSERT OR REPLACE INTO trace_runs (id, message_id, thread_id, workspace_id, trace_id, root_span_id, model_id, status, started_at, ended_at, duration_ms, error_code, error_message, attrs_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id,
          row.messageId,
          row.threadId,
          row.workspaceId,
          row.traceId,
          row.rootSpanId,
          row.modelId,
          row.status,
          row.startedAt,
          row.endedAt,
          row.durationMs,
          row.errorCode,
          row.errorMessage,
          row.attrsJson,
        );
        break;
      }
      case "trace_span_upserted": {
        const row = payload.row;
        this.access.exec(
          `INSERT OR REPLACE INTO trace_spans (id, trace_run_id, trace_id, parent_span_id, message_id, name, kind, status, started_at, ended_at, duration_ms, error_code, error_message, attrs_json, events_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.id,
          row.traceRunId,
          row.traceId,
          row.parentSpanId,
          row.messageId,
          row.name,
          row.kind,
          row.status,
          row.startedAt,
          row.endedAt,
          row.durationMs,
          row.errorCode,
          row.errorMessage,
          row.attrsJson,
          row.eventsJson,
        );
        break;
      }
      case "server_state_rebased": {
        this.replaceSnapshot(payload.snapshot);
        break;
      }
      default: {
        const _exhaustive: never = eventType;
        console.warn("[event-store] unhandled event type", _exhaustive);
      }
    }
  }
}
