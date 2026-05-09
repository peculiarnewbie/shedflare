import { SYNC_PROTOCOL_VERSION } from "#/domain";

/**
 * All user/sync data tables. Used by snapshot replacement (replaceSnapshot)
 * and reset operations (resetStorage command).
 */
export const DATA_TABLES = [
  "workspaces",
  "account_settings",
  "threads",
  "messages",
  "message_parts",
  "attachments",
  "search_runs",
  "search_results",
  "extract_runs",
  "trace_runs",
  "trace_spans",
] as const;

/**
 * All tables including the event log and commands ledger.
 * Used by full resets that drop everything (protocol version change).
 */
const ALL_TABLES = [...DATA_TABLES, "events", "commands", "pending_turns"] as const;

const DDL = `
  CREATE TABLE IF NOT EXISTS events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    op_id TEXT,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS commands (
    op_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    response_json TEXT,
    created_at TEXT NOT NULL,
    acked_seq INTEGER
  );
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    default_model_id TEXT NOT NULL,
    default_reasoning_level TEXT NOT NULL,
    default_search_mode INTEGER NOT NULL,
    prefer_free_search INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    sort_key INTEGER NOT NULL,
    optimistic INTEGER,
    op_id TEXT
  );
  CREATE TABLE IF NOT EXISTS account_settings (
    id TEXT PRIMARY KEY,
    expand_reasoning_by_default INTEGER NOT NULL,
    show_traces INTEGER NOT NULL,
    title_generation_model_id TEXT,
    title_generation_model_interleaved_field TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    optimistic INTEGER,
    op_id TEXT
  );
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    title TEXT NOT NULL,
    pinned INTEGER NOT NULL,
    head_message_id TEXT,
    model_id TEXT,
    reasoning_level TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_message_at TEXT NOT NULL,
    archived_at TEXT,
    forked_from_thread_id TEXT,
    forked_from_message_id TEXT,
    optimistic INTEGER,
    op_id TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    parent_message_id TEXT,
    source_message_id TEXT,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    model_id TEXT NOT NULL,
    reasoning_level TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT,
    search_enabled INTEGER NOT NULL,
    duration_ms INTEGER,
    ttft_ms INTEGER,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    optimistic INTEGER,
    op_id TEXT
  );
  CREATE TABLE IF NOT EXISTS message_parts (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    json TEXT
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    message_id TEXT,
    object_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT,
    width INTEGER,
    height INTEGER,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    optimistic INTEGER,
    op_id TEXT
  );
  CREATE TABLE IF NOT EXISTS search_runs (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    query TEXT NOT NULL,
    status TEXT NOT NULL,
    step INTEGER NOT NULL,
    num_results INTEGER NOT NULL,
    result_count INTEGER NOT NULL,
    preview_text TEXT NOT NULL,
    error_message TEXT,
    mode TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS search_results (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    search_run_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    snippet TEXT NOT NULL,
    published_at TEXT,
    domain TEXT NOT NULL,
    score INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS extract_runs (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    step INTEGER NOT NULL,
    char_count INTEGER NOT NULL,
    original_length INTEGER,
    truncated INTEGER NOT NULL,
    error_message TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trace_runs (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    thread_id TEXT,
    workspace_id TEXT,
    trace_id TEXT NOT NULL,
    root_span_id TEXT NOT NULL,
    model_id TEXT,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_ms INTEGER,
    error_code TEXT,
    error_message TEXT,
    attrs_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trace_spans (
    id TEXT PRIMARY KEY,
    trace_run_id TEXT,
    trace_id TEXT NOT NULL,
    parent_span_id TEXT,
    message_id TEXT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_ms INTEGER,
    error_code TEXT,
    error_message TEXT,
    attrs_json TEXT NOT NULL,
    events_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_seq ON events(seq);
  CREATE INDEX IF NOT EXISTS idx_commands_seq ON commands(acked_seq);
  CREATE INDEX IF NOT EXISTS idx_threads_workspace ON threads(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
  CREATE INDEX IF NOT EXISTS idx_parts_message_seq ON message_parts(message_id, seq);
  CREATE INDEX IF NOT EXISTS idx_attachments_thread ON attachments(thread_id);
  CREATE INDEX IF NOT EXISTS idx_search_runs_message ON search_runs(message_id);
  CREATE INDEX IF NOT EXISTS idx_search_results_message ON search_results(message_id);
  CREATE INDEX IF NOT EXISTS idx_extract_runs_message ON extract_runs(message_id);
  CREATE INDEX IF NOT EXISTS idx_trace_runs_message ON trace_runs(message_id);
  CREATE INDEX IF NOT EXISTS idx_trace_spans_trace_run ON trace_spans(trace_run_id);

  CREATE TABLE IF NOT EXISTS pending_turns (
    message_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

export function initializeStorage(
  exec: (query: string, ...params: any[]) => void,
  queryOne: <T extends Record<string, unknown>>(query: string, ...params: any[]) => T | null,
  log: (message: string) => void,
) {
  log("initialize");
  exec(DDL);
  {
    const cols = queryOne<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='threads'`,
    );
    if (cols && !cols.sql.includes("forked_from_thread_id")) {
      exec(`ALTER TABLE threads ADD COLUMN forked_from_thread_id TEXT`);
      exec(`ALTER TABLE threads ADD COLUMN forked_from_message_id TEXT`);
    }
  }
  const version = queryOne<{ value: string }>(
    `SELECT value FROM metadata WHERE key = 'sync_protocol_version'`,
  );
  if (version?.value !== SYNC_PROTOCOL_VERSION) {
    resetForProtocolVersion(exec);
  }
}

export function resetForProtocolVersion(exec: (query: string, ...params: any[]) => void) {
  for (const tableName of ALL_TABLES) {
    exec(`DELETE FROM ${tableName}`);
  }
  exec(`DELETE FROM sqlite_sequence`);
  exec(
    `INSERT OR REPLACE INTO metadata (key, value) VALUES ('sync_protocol_version', ?)`,
    SYNC_PROTOCOL_VERSION,
  );
}

export function deleteAllData(exec: (query: string, ...params: any[]) => void) {
  for (const tableName of DATA_TABLES) {
    exec(`DELETE FROM ${tableName}`);
  }
  exec(`DELETE FROM events`);
  exec(`DELETE FROM commands`);
  exec(`DELETE FROM metadata WHERE key <> 'sync_protocol_version'`);
  exec(`DELETE FROM sqlite_sequence`);
  exec(
    `INSERT OR REPLACE INTO metadata (key, value) VALUES ('sync_protocol_version', ?)`,
    SYNC_PROTOCOL_VERSION,
  );
}
