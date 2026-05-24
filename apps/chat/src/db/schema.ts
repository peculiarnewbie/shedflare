import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const metadata = sqliteTable("metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const events = sqliteTable(
  "events",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    eventId: text("event_id").notNull().unique(),
    opId: text("op_id"),
    type: text("type").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_events_seq").on(table.seq)],
);

export const commands = sqliteTable(
  "commands",
  {
    opId: text("op_id").primaryKey(),
    type: text("type").notNull(),
    status: text("status").notNull(),
    responseJson: text("response_json"),
    createdAt: text("created_at").notNull(),
    ackedSeq: integer("acked_seq"),
  },
  (table) => [index("idx_commands_seq").on(table.ackedSeq)],
);

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  defaultModelId: text("default_model_id").notNull(),
  defaultReasoningLevel: text("default_reasoning_level", {
    enum: ["off", "low", "medium", "high"],
  }).notNull(),
  defaultSearchMode: integer("default_search_mode", { mode: "boolean" }).notNull(),
  defaultSearchLimit: integer("default_search_limit").notNull(),
  preferFreeSearch: integer("prefer_free_search", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  archivedAt: text("archived_at"),
  sortKey: integer("sort_key").notNull(),
  optimistic: integer("optimistic", { mode: "boolean" }),
  opId: text("op_id"),
});

export const accountSettings = sqliteTable("account_settings", {
  id: text("id").primaryKey(),
  expandReasoningByDefault: integer("expand_reasoning_by_default", { mode: "boolean" }).notNull(),
  showTraces: integer("show_traces", { mode: "boolean" }).notNull(),
  titleGenerationModelId: text("title_generation_model_id"),
  titleGenerationModelInterleavedField: text("title_generation_model_interleaved_field"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  optimistic: integer("optimistic", { mode: "boolean" }),
  opId: text("op_id"),
});

export const threads = sqliteTable(
  "threads",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    title: text("title").notNull(),
    pinned: integer("pinned", { mode: "boolean" }).notNull(),
    headMessageId: text("head_message_id"),
    modelId: text("model_id"),
    reasoningLevel: text("reasoning_level", { enum: ["off", "low", "medium", "high"] }),
    searchEnabled: integer("search_enabled", { mode: "boolean" }),
    searchLimit: integer("search_limit"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastMessageAt: text("last_message_at").notNull(),
    archivedAt: text("archived_at"),
    forkedFromThreadId: text("forked_from_thread_id"),
    forkedFromMessageId: text("forked_from_message_id"),
    optimistic: integer("optimistic", { mode: "boolean" }),
    opId: text("op_id"),
  },
  (table) => [index("idx_threads_workspace").on(table.workspaceId)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    parentMessageId: text("parent_message_id"),
    sourceMessageId: text("source_message_id"),
    role: text("role").notNull(),
    status: text("status", {
      enum: ["queued", "pending", "streaming", "completed", "failed", "cancelled"],
    }).notNull(),
    modelId: text("model_id").notNull(),
    reasoningLevel: text("reasoning_level", {
      enum: ["off", "low", "medium", "high"],
    }).notNull(),
    text: text("text").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    searchEnabled: integer("search_enabled", { mode: "boolean" }).notNull(),
    durationMs: integer("duration_ms"),
    ttftMs: integer("ttft_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    optimistic: integer("optimistic", { mode: "boolean" }),
    opId: text("op_id"),
  },
  (table) => [index("idx_messages_thread").on(table.threadId)],
);

export const messageParts = sqliteTable(
  "message_parts",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull(),
    seq: integer("seq").notNull(),
    kind: text("kind", { enum: ["activity", "thinking_tokens", "text", "reasoning"] }).notNull(),
    text: text("text").notNull(),
    json: text("json"),
  },
  (table) => [index("idx_parts_message_seq").on(table.messageId, table.seq)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    messageId: text("message_id"),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    width: integer("width"),
    height: integer("height"),
    status: text("status", { enum: ["queued", "uploading", "ready", "failed"] }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    optimistic: integer("optimistic", { mode: "boolean" }),
    opId: text("op_id"),
  },
  (table) => [index("idx_attachments_thread").on(table.threadId)],
);

export const searchRuns = sqliteTable(
  "search_runs",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull(),
    query: text("query").notNull(),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    step: integer("step").notNull(),
    numResults: integer("num_results").notNull(),
    resultCount: integer("result_count").notNull(),
    previewText: text("preview_text").notNull(),
    errorMessage: text("error_message"),
    mode: text("mode", { enum: ["api", "mcp"] }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_search_runs_message").on(table.messageId)],
);

export const searchResults = sqliteTable(
  "search_results",
  {
    id: text("id").primaryKey(),
    searchRunId: text("search_run_id").notNull(),
    messageId: text("message_id").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    snippet: text("snippet").notNull(),
    publishedAt: text("published_at"),
    domain: text("domain").notNull(),
    score: integer("score").notNull(),
  },
  (table) => [index("idx_search_results_message").on(table.messageId)],
);

export const extractRuns = sqliteTable(
  "extract_runs",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull(),
    url: text("url").notNull(),
    status: text("status", { enum: ["active", "completed", "failed"] }).notNull(),
    step: integer("step").notNull(),
    charCount: integer("char_count").notNull(),
    originalLength: integer("original_length"),
    truncated: integer("truncated", { mode: "boolean" }).notNull(),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_extract_runs_message").on(table.messageId)],
);

export const traceRuns = sqliteTable(
  "trace_runs",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id"),
    threadId: text("thread_id"),
    workspaceId: text("workspace_id"),
    traceId: text("trace_id").notNull(),
    rootSpanId: text("root_span_id").notNull(),
    modelId: text("model_id"),
    status: text("status", { enum: ["running", "completed", "failed", "cancelled"] }).notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    attrsJson: text("attrs_json").notNull(),
  },
  (table) => [index("idx_trace_runs_message").on(table.messageId)],
);

export const traceSpans = sqliteTable(
  "trace_spans",
  {
    id: text("id").primaryKey(),
    traceRunId: text("trace_run_id"),
    traceId: text("trace_id").notNull(),
    parentSpanId: text("parent_span_id"),
    messageId: text("message_id"),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["root", "internal", "tool", "model", "io", "sync"] }).notNull(),
    status: text("status", { enum: ["running", "completed", "failed", "cancelled"] }).notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    attrsJson: text("attrs_json").notNull(),
    eventsJson: text("events_json").notNull(),
  },
  (table) => [index("idx_trace_spans_trace_run").on(table.traceRunId)],
);

export const pendingTurns = sqliteTable("pending_turns", {
  messageId: text("message_id").primaryKey(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
});

type SyncMeta<T extends { optimistic: boolean | null; opId: string | null }> = Omit<
  T,
  "optimistic" | "opId"
> & {
  optimistic?: boolean | null;
  opId?: string | null;
};

export type Workspace = SyncMeta<typeof workspaces.$inferSelect>;
export type AccountSettings = SyncMeta<typeof accountSettings.$inferSelect>;
export type Thread = SyncMeta<typeof threads.$inferSelect>;
export type MessageRole = "user" | "assistant" | "system";
export type Message = Omit<SyncMeta<typeof messages.$inferSelect>, "role"> & {
  role: MessageRole;
};
export type MessagePart = typeof messageParts.$inferSelect;
export type Attachment = SyncMeta<typeof attachments.$inferSelect>;
export type SearchRun = Omit<typeof searchRuns.$inferSelect, "mode"> & {
  mode?: "api" | "mcp" | null;
};
export type SearchResult = typeof searchResults.$inferSelect;
export type ExtractRun = typeof extractRuns.$inferSelect;
export type TraceRun = typeof traceRuns.$inferSelect;
export type TraceSpan = typeof traceSpans.$inferSelect;
