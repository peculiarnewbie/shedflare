import {
  clampSearchesPerTurn,
  decodeAccountSettingsRow,
  decodeAttachmentRow,
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
  type AccountSettings,
  type Attachment,
  type ComparisonGroup,
  type ExtractRun,
  type Message,
  type MessagePart,
  type SearchResult,
  type SearchRun,
  type Thread,
  type TraceRun,
  type TraceSpan,
  type Workspace,
} from "#/domain";
import { sqlToBool } from "./sync-utils";

export type PersistedTableMap = {
  account_settings: AccountSettings;
  workspaces: Workspace;
  threads: Thread;
  messages: Message;
  message_parts: MessagePart;
  attachments: Attachment;
  search_runs: SearchRun;
  search_results: SearchResult;
  extract_runs: ExtractRun;
  trace_runs: TraceRun;
  trace_spans: TraceSpan;
  comparison_groups: ComparisonGroup;
};

export type PersistedTableName = keyof PersistedTableMap;

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

const INFLATE_DISPATCH: {
  [TableName in PersistedTableName]: (row: Record<string, unknown>) => PersistedTableMap[TableName];
} = {
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

export function inflateRow<TableName extends PersistedTableName>(
  tableName: TableName,
  row: Record<string, unknown>,
): PersistedTableMap[TableName] {
  return INFLATE_DISPATCH[tableName](row) as PersistedTableMap[TableName];
}
