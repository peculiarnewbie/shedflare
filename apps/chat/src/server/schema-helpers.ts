/**
 * Table helpers derived from the Drizzle schema in `src/db/schema.ts`.
 *
 * These are used for destructive operations (snapshot replacement, full reset)
 * that need to enumerate user/sync data tables. The DDL itself is owned by
 * Drizzle migrations; this file should never contain raw CREATE TABLE strings.
 */
import { SYNC_PROTOCOL_VERSION } from "#/domain";

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
  "comparison_groups",
] as const;

export const ALL_TABLES = [...DATA_TABLES, "events", "commands", "pending_turns"] as const;

export function deleteAllData(exec: (query: string, ...params: unknown[]) => void) {
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

export function resetForProtocolVersion(exec: (query: string, ...params: unknown[]) => void) {
  for (const tableName of ALL_TABLES) {
    exec(`DELETE FROM ${tableName}`);
  }
  exec(`DELETE FROM sqlite_sequence`);
}
