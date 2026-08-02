import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "workers-vitest";
import { DataAccess as SyncDataAccess } from "@shedflare/sync-protocol";
import {
  createAccountSettings,
  createAttachment,
  createComparisonGroup,
  createExtractRun,
  createMessage,
  createMessagePart,
  createSearchRun,
  createThread,
  createTraceRun,
  createTraceSpan,
  createWorkspace,
  type SyncSnapshot,
  type Workspace,
} from "../../src/domain";
import * as dbSchema from "../../src/db/schema";
import type { ChatBackup } from "../../src/server/backup-reader";
import { ChatRepository } from "../../src/server/chat-repository";
import { DataAccess } from "../../src/server/data-access";
import { EffectDatabase } from "../../src/server/effect-database";
import { EventStore } from "../../src/server/event-store";
import type { ThreadSummaryPage } from "../../src/server/snapshot-reader";

const NOW = "2026-01-01T00:00:00.000Z";

async function initialize(name: string) {
  const stub = env.SYNC_ENGINE.getByName(name);
  const response = await stub.fetch("https://sync-engine.test/internal/snapshot");
  expect(response.status).toBe(200);
  return stub;
}

function persistence(state: DurableObjectState) {
  const database = new EffectDatabase(state.storage);
  const syncAccess = new SyncDataAccess((query, ...params) =>
    state.storage.sql.exec(query, ...params),
  );
  const access = new DataAccess({ database, sql: syncAccess });
  const repository = new ChatRepository(access);
  return {
    access,
    repository,
    database,
    eventStore: new EventStore({ sql: access, repository, syncAccess }),
  };
}

function workspace(id: string): Workspace {
  return {
    ...createWorkspace({ name: `Workspace ${id}`, defaultModelId: "test-model" }),
    id,
    slug: id,
    createdAt: NOW,
    updatedAt: NOW,
    optimistic: false,
    opId: `op-${id}`,
  };
}

function insertWorkspaceRaw(access: DataAccess, row: Workspace): void {
  access.exec(
    `INSERT INTO workspaces (
       id, name, slug, system_prompt, default_model_id, default_reasoning_level,
       default_search_mode, default_search_limit, prefer_free_search, created_at,
       updated_at, archived_at, sort_key, optimistic, op_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.name,
    row.slug,
    row.systemPrompt,
    row.defaultModelId,
    row.defaultReasoningLevel,
    row.defaultSearchMode ? 1 : 0,
    row.defaultSearchLimit,
    row.preferFreeSearch ? 1 : 0,
    row.createdAt,
    row.updatedAt,
    row.archivedAt,
    row.sortKey,
    row.optimistic ? 1 : 0,
    row.opId ?? null,
  );
}

function seedThreadGraph(access: DataAccess, id: string, lastMessageAt = NOW): void {
  const messageId = `${id}-message`;
  const searchRunId = `${id}-search-run`;
  const traceRunId = `${id}-trace-run`;

  access.exec(
    `INSERT INTO threads (
       id, workspace_id, title, pinned, created_at, updated_at, last_message_at
    ) VALUES (?, 'workspace', ?, 0, ?, ?, ?)`,
    id,
    id,
    NOW,
    NOW,
    lastMessageAt,
  );
  access.exec(
    `INSERT INTO messages (
       id, thread_id, role, status, model_id, reasoning_level, text,
       created_at, updated_at, search_enabled
     ) VALUES (?, ?, 'user', 'completed', 'test-model', 'off', '', ?, ?, 0)`,
    messageId,
    id,
    NOW,
    NOW,
  );
  access.exec(
    "INSERT INTO message_parts (id, message_id, seq, kind, text) VALUES (?, ?, 0, 'text', '')",
    `${id}-part`,
    messageId,
  );
  access.exec(
    `INSERT INTO attachments (
       id, thread_id, object_key, file_name, mime_type, size_bytes, status, created_at, updated_at
     ) VALUES (?, ?, ?, 'file.txt', 'text/plain', 1, 'ready', ?, ?)`,
    `${id}-attachment`,
    id,
    `${id}/file.txt`,
    NOW,
    NOW,
  );
  access.exec(
    `INSERT INTO search_runs (
       id, message_id, query, status, step, num_results, result_count,
       preview_text, created_at
     ) VALUES (?, ?, 'query', 'completed', 1, 1, 1, '', ?)`,
    searchRunId,
    messageId,
    NOW,
  );
  access.exec(
    `INSERT INTO search_results (
       id, search_run_id, message_id, url, title, snippet, domain, score
     ) VALUES (?, ?, ?, 'https://example.com', 'Example', '', 'example.com', 1)`,
    `${id}-search-result`,
    searchRunId,
    messageId,
  );
  access.exec(
    `INSERT INTO extract_runs (
       id, message_id, url, status, step, char_count, truncated, created_at
     ) VALUES (?, ?, 'https://example.com', 'completed', 1, 1, 0, ?)`,
    `${id}-extract-run`,
    messageId,
    NOW,
  );
  access.exec(
    `INSERT INTO trace_runs (
       id, message_id, thread_id, workspace_id, trace_id, root_span_id,
       status, started_at, attrs_json
     ) VALUES (?, ?, ?, 'workspace', ?, ?, 'completed', ?, '{}')`,
    traceRunId,
    messageId,
    id,
    `${id}-trace`,
    `${id}-root-span`,
    NOW,
  );
  access.exec(
    `INSERT INTO trace_spans (
       id, trace_run_id, trace_id, message_id, name, kind, status,
       started_at, attrs_json, events_json
     ) VALUES (?, ?, ?, ?, 'test', 'internal', 'completed', ?, '{}', '[]')`,
    `${id}-trace-span`,
    traceRunId,
    `${id}-trace`,
    messageId,
    NOW,
  );
}

describe("Chat persistence boundaries", () => {
  it("shares one SQLite state between raw DataAccess and Drizzle", async () => {
    const stub = await initialize("mixed-access");

    await runInDurableObject(stub, (_instance, state) => {
      const { access, database, repository } = persistence(state);
      const rawRow = workspace("raw-workspace");
      const drizzleRow = workspace("drizzle-workspace");

      insertWorkspaceRaw(access, rawRow);
      expect(repository.getWorkspace(rawRow.id)).toEqual(rawRow);

      database.runSync(database.drizzle.insert(dbSchema.workspaces).values(drizzleRow));
      expect(
        access.queryOne<{ name: string; default_search_mode: number }>(
          "SELECT name, default_search_mode FROM workspaces WHERE id = ?",
          drizzleRow.id,
        ),
      ).toEqual({ name: drizzleRow.name, default_search_mode: 0 });
    });
  });

  it("appends an event, projection, and sequence as one operation", async () => {
    const stub = await initialize("event-projection");

    await runInDurableObject(stub, async (_instance, state) => {
      const { access, repository, eventStore } = persistence(state);
      const row = workspace("event-workspace");

      const event = await eventStore.appendServerEvent("event-op", "workspace_upserted", {
        row,
      });

      expect(event).toMatchObject({
        type: "event",
        serverSeq: 1,
        eventType: "workspace_upserted",
        causedByOpId: "event-op",
      });
      expect(access.getLastServerSeq()).toBe(1);
      expect(repository.getWorkspace(row.id)).toEqual(row);
    });
  });

  it("rolls back the event when its raw-SQL projection fails", async () => {
    const stub = await initialize("projection-rollback");

    await runInDurableObject(stub, async (_instance, state) => {
      const { access, repository, eventStore } = persistence(state);
      const row = workspace("rejected-workspace");
      access.exec(`
        CREATE TRIGGER reject_workspace_projection
        BEFORE INSERT ON workspaces
        BEGIN
          SELECT RAISE(ABORT, 'projection rejected');
        END
      `);

      await expect(
        eventStore.appendServerEvent("rejected-op", "workspace_upserted", { row }),
      ).rejects.toThrow();

      expect(access.getLastServerSeq()).toBe(0);
      expect(repository.getWorkspace(row.id)).toBeNull();
      expect(access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM events")).toEqual({
        count: 0,
      });
    });
  });

  it("deletes one thread persistence graph without touching another", async () => {
    const stub = await initialize("thread-cascade");

    await runInDurableObject(stub, (_instance, state) => {
      const { access, repository } = persistence(state);
      seedThreadGraph(access, "target");
      seedThreadGraph(access, "survivor");

      repository.deleteThreadCascade("target");

      for (const table of [
        "threads",
        "messages",
        "message_parts",
        "attachments",
        "search_runs",
        "search_results",
        "extract_runs",
        "trace_runs",
        "trace_spans",
      ]) {
        expect(
          access.queryOne<{ count: number }>(
            `SELECT COUNT(*) AS count FROM ${table} WHERE id LIKE 'target-%' OR id = 'target'`,
          ),
          `${table} target rows`,
        ).toEqual({ count: 0 });
        expect(
          access.queryOne<{ count: number }>(
            `SELECT COUNT(*) AS count FROM ${table} WHERE id LIKE 'survivor-%' OR id = 'survivor'`,
          ),
          `${table} survivor rows`,
        ).toEqual({ count: 1 });
      }
    });
  });

  it("reads paged history, detail and trace snapshots, and a complete backup", async () => {
    const stub = await initialize("read-models");

    await runInDurableObject(stub, (_instance, state) => {
      const { access } = persistence(state);
      insertWorkspaceRaw(access, workspace("workspace"));
      seedThreadGraph(access, "older", "2025-12-31T00:00:00.000Z");
      seedThreadGraph(access, "newer", NOW);
      access.exec(
        `INSERT INTO commands (op_id, type, status, response_json, created_at, acked_seq)
         VALUES ('backup-command', 'test_command', 'acked', '{}', ?, 0)`,
        NOW,
      );
    });

    const firstPageResponse = await stub.fetch(
      "https://sync-engine.test/history/threads?workspaceId=workspace&limit=1",
    );
    expect(firstPageResponse.status).toBe(200);
    const firstPage = (await firstPageResponse.json()) as ThreadSummaryPage;
    expect(firstPage.threads.map((thread) => thread.id)).toEqual(["newer"]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPageResponse = await stub.fetch(
      `https://sync-engine.test/history/threads?workspaceId=workspace&limit=1&before=${encodeURIComponent(firstPage.nextCursor ?? "")}`,
    );
    expect(secondPageResponse.status).toBe(200);
    const secondPage = (await secondPageResponse.json()) as ThreadSummaryPage;
    expect(secondPage.threads.map((thread) => thread.id)).toEqual(["older"]);
    expect(secondPage.nextCursor).toBeNull();

    const detailResponse = await stub.fetch(
      "https://sync-engine.test/history/threads/newer?includeSearch=false&includeTrace=true",
    );
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as SyncSnapshot;
    expect(Object.keys(detail.tables.threads ?? {})).toEqual(["newer"]);
    expect(Object.keys(detail.tables.messages ?? {})).toEqual(["newer-message"]);
    expect(detail.tables.search_runs).toEqual({});
    expect(Object.keys(detail.tables.trace_runs ?? {})).toEqual(["newer-trace-run"]);

    const traceResponse = await stub.fetch(
      "https://sync-engine.test/history/messages/newer-message/trace",
    );
    expect(traceResponse.status).toBe(200);
    const trace = (await traceResponse.json()) as SyncSnapshot;
    expect(Object.keys(trace.tables.trace_runs ?? {})).toEqual(["newer-trace-run"]);
    expect(Object.keys(trace.tables.trace_spans ?? {})).toEqual(["newer-trace-span"]);

    const backupResponse = await stub.fetch("https://sync-engine.test/backup/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ createdAt: NOW }),
    });
    expect(backupResponse.status).toBe(200);
    const backup = (await backupResponse.json()) as ChatBackup;
    expect(backup).toMatchObject({
      version: 1,
      app: "chat",
      createdAt: NOW,
      serverSeq: 0,
      commands: [{ opId: "backup-command", ackedSeq: 0 }],
    });
    expect(Object.keys(backup.snapshot.tables.threads ?? {}).sort()).toEqual(["newer", "older"]);
  });

  it("projects every event family into the shared SQLite state", async () => {
    const stub = await initialize("projection-families");

    await runInDurableObject(stub, async (_instance, state) => {
      const { access, repository, eventStore } = persistence(state);
      const settings = createAccountSettings({ id: "default" });
      const workspaceRow = workspace("families-workspace");
      const threadRow = {
        ...createThread({ workspaceId: workspaceRow.id, title: "Families" }),
        id: "families-thread",
        createdAt: NOW,
        updatedAt: NOW,
        lastMessageAt: NOW,
      };
      const messageRow = {
        ...createMessage({
          threadId: threadRow.id,
          role: "user",
          modelId: "test-model",
          text: "hello",
        }),
        id: "families-message",
        createdAt: NOW,
        updatedAt: NOW,
      };
      const partRow = createMessagePart({
        messageId: messageRow.id,
        seq: 0,
        kind: "text",
        text: "hello",
      });
      const attachmentRow = createAttachment({
        threadId: threadRow.id,
        messageId: messageRow.id,
        objectKey: "families/file.txt",
        fileName: "file.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        status: "ready",
      });
      const searchRunRow = createSearchRun({
        messageId: messageRow.id,
        query: "example",
        status: "completed",
        step: 1,
        numResults: 1,
        resultCount: 1,
        previewText: "Example",
      });
      const searchResultRow = {
        id: "families-search-result",
        searchRunId: searchRunRow.id,
        messageId: messageRow.id,
        url: "https://example.com",
        title: "Example",
        snippet: "Example result",
        publishedAt: null,
        domain: "example.com",
        score: 1,
      };
      const extractRunRow = createExtractRun({
        messageId: messageRow.id,
        url: "https://example.com",
        status: "completed",
        step: 1,
        charCount: 7,
      });
      const traceRunRow = createTraceRun({
        messageId: messageRow.id,
        threadId: threadRow.id,
        workspaceId: workspaceRow.id,
        traceId: "families-trace",
        rootSpanId: "families-root",
        status: "completed",
      });
      const traceSpanRow = createTraceSpan({
        traceRunId: traceRunRow.id,
        traceId: traceRunRow.traceId,
        messageId: messageRow.id,
        name: "families",
        kind: "internal",
        status: "completed",
      });
      const comparisonGroupRow = createComparisonGroup({
        workspaceId: workspaceRow.id,
        threadIds: [threadRow.id],
      });

      await eventStore.appendServerEvent("families-settings", "account_settings_upserted", {
        row: settings,
      });
      await eventStore.appendServerEvent("families-workspace", "workspace_upserted", {
        row: workspaceRow,
      });
      await eventStore.appendServerEvent("families-workspace-archive", "workspace_archived", {
        id: workspaceRow.id,
        archivedAt: NOW,
        updatedAt: NOW,
      });
      await eventStore.appendServerEvent("families-thread", "thread_upserted", {
        row: threadRow,
      });
      await eventStore.appendServerEvent("families-thread-archive", "thread_archived", {
        id: threadRow.id,
        archivedAt: NOW,
        updatedAt: NOW,
      });
      await eventStore.appendServerEvent("families-message", "message_upserted", {
        row: messageRow,
      });
      await eventStore.appendServerEvent("families-delta", "message_delta", {
        messageId: messageRow.id,
        delta: " world",
        updatedAt: NOW,
      });
      await eventStore.appendServerEvent("families-completed", "message_completed", {
        messageId: messageRow.id,
        text: "hello world!",
        updatedAt: NOW,
        durationMs: 10,
        ttftMs: 2,
        promptTokens: 3,
        completionTokens: 4,
      });
      await eventStore.appendServerEvent("families-failed", "message_failed", {
        messageId: messageRow.id,
        errorCode: "test_failure",
        errorMessage: "expected test failure",
        updatedAt: NOW,
      });
      await eventStore.appendServerEvent("families-part", "message_part_appended", {
        row: partRow,
      });
      await eventStore.appendServerEvent("families-attachment", "attachment_upserted", {
        row: attachmentRow,
      });
      await eventStore.appendServerEvent("families-search-runs", "search_runs_replaced", {
        messageId: messageRow.id,
        rows: [searchRunRow],
      });
      await eventStore.appendServerEvent("families-search-results", "search_results_replaced", {
        messageId: messageRow.id,
        rows: [searchResultRow],
      });
      await eventStore.appendServerEvent("families-extract", "extract_runs_replaced", {
        messageId: messageRow.id,
        rows: [extractRunRow],
      });
      await eventStore.appendServerEvent("families-trace-run", "trace_run_upserted", {
        row: traceRunRow,
      });
      await eventStore.appendServerEvent("families-trace-span", "trace_span_upserted", {
        row: traceSpanRow,
      });
      await eventStore.appendServerEvent("families-comparison", "comparison_group_upserted", {
        row: comparisonGroupRow,
      });
      await eventStore.appendServerEvent("families-attachment-delete", "attachment_deleted", {
        id: attachmentRow.id,
      });

      expect(repository.getAccountSettings()).toMatchObject({ id: "default" });
      expect(repository.getWorkspace(workspaceRow.id)).toMatchObject({ archivedAt: NOW });
      expect(repository.getThread(threadRow.id)).toMatchObject({ archivedAt: NOW });
      expect(repository.getMessage(messageRow.id)).toMatchObject({
        status: "failed",
        errorCode: "test_failure",
      });
      expect(
        access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM message_parts"),
      ).toEqual({
        count: 1,
      });
      expect(
        access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM attachments"),
      ).toEqual({
        count: 0,
      });
      expect(
        access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM search_runs"),
      ).toEqual({
        count: 1,
      });
      expect(
        access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM search_results"),
      ).toEqual({
        count: 1,
      });
      expect(
        access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM extract_runs"),
      ).toEqual({
        count: 1,
      });
      expect(
        access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM trace_runs"),
      ).toEqual({
        count: 1,
      });
      expect(
        access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM trace_spans"),
      ).toEqual({
        count: 1,
      });
      expect(
        access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM comparison_groups"),
      ).toEqual({
        count: 1,
      });
    });
  });

  it("rolls back a server snapshot rebase when a later projection fails", async () => {
    const stub = await initialize("rebase-rollback");

    await runInDurableObject(stub, async (_instance, state) => {
      const { access, repository, eventStore } = persistence(state);
      const existing = workspace("existing-rebase-workspace");
      const replacement = workspace("replacement-rebase-workspace");
      await eventStore.appendServerEvent("existing-rebase", "workspace_upserted", {
        row: existing,
      });
      access.exec(
        `CREATE TRIGGER reject_rebased_workspace
         BEFORE INSERT ON workspaces
         BEGIN
           SELECT RAISE(ABORT, 'rebase projection rejected');
         END`,
      );

      const snapshot: SyncSnapshot = {
        serverSeq: 99,
        tables: {
          workspaces: { [replacement.id]: replacement },
        },
      };

      await expect(
        eventStore.appendServerEvent("rebase-failure", "server_state_rebased", { snapshot }),
      ).rejects.toThrow();

      expect(repository.getWorkspace(existing.id)).toEqual(existing);
      expect(repository.getWorkspace(replacement.id)).toBeNull();
      expect(access.getLastServerSeq()).toBe(1);
      expect(access.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM events")).toEqual({
        count: 1,
      });
    });
  });
});
