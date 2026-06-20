import {
  decodeSyncSnapshot,
  TABLES,
  type ComparisonGroup,
  type SyncSnapshot,
  type Thread,
} from "#/domain";
import { applyPartialSnapshot } from "./sync-adapter";
import { authFetch } from "./auth-fetch";

export type ThreadSummaryPage = {
  serverSeq: number;
  threads: Thread[];
  comparisonGroups: ComparisonGroup[];
  nextCursor: string | null;
};

function rowsById<T extends { id: string }>(rows: T[]): Record<string, T> {
  const result: Record<string, T> = {};
  for (const row of rows) result[row.id] = row;
  return result;
}

function isThreadSummaryPage(value: unknown): value is ThreadSummaryPage {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Record<string, unknown>;
  return (
    typeof page.serverSeq === "number" &&
    Array.isArray(page.threads) &&
    Array.isArray(page.comparisonGroups) &&
    (typeof page.nextCursor === "string" || page.nextCursor === null)
  );
}

async function fetchJson(url: URL | string) {
  const response = await authFetch(url);
  if (!response.ok) {
    throw new Error(`History request failed: ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}

export async function loadOlderThreads(input: {
  workspaceId?: string | null;
  before?: string | null;
  limit?: number;
}): Promise<ThreadSummaryPage> {
  const url = new URL("/api/sync/history/threads", window.location.origin);
  if (input.workspaceId) url.searchParams.set("workspaceId", input.workspaceId);
  if (input.before) url.searchParams.set("before", input.before);
  if (input.limit) url.searchParams.set("limit", String(input.limit));

  const body = await fetchJson(url);
  if (!isThreadSummaryPage(body)) throw new Error("Invalid thread history response");

  applyPartialSnapshot({
    [TABLES.threads]: rowsById(body.threads),
    [TABLES.comparisonGroups]: rowsById(body.comparisonGroups),
  });
  return body;
}

async function loadSnapshot(url: URL): Promise<SyncSnapshot> {
  const body = await fetchJson(url);
  const snapshot = decodeSyncSnapshot(body);
  if (!snapshot) throw new Error("Invalid history snapshot response");
  applyPartialSnapshot(snapshot.tables);
  return snapshot;
}

export function loadThreadDetail(threadId: string, input: { includeTrace?: boolean } = {}) {
  const url = new URL(
    `/api/sync/history/threads/${encodeURIComponent(threadId)}`,
    window.location.origin,
  );
  url.searchParams.set("includeSearch", "true");
  if (input.includeTrace) url.searchParams.set("includeTrace", "true");
  return loadSnapshot(url);
}

export function loadMessageTrace(messageId: string) {
  const url = new URL(
    `/api/sync/history/messages/${encodeURIComponent(messageId)}/trace`,
    window.location.origin,
  );
  return loadSnapshot(url);
}
