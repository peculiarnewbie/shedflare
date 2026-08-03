import { abortAllDurableObjects, env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "workers-vitest";
import migrationManifest from "../../drizzle/migrations";
import { SYNC_PROTOCOL_VERSION } from "../../src/domain";
import { EffectDatabase } from "../../src/server/effect-database";
import { migrateDatabase } from "../../src/server/migrator";

const EXPECTED_TABLES = [
  "__drizzle_migrations",
  "account_settings",
  "attachments",
  "commands",
  "comparison_groups",
  "events",
  "extract_runs",
  "message_parts",
  "messages",
  "metadata",
  "pending_turns",
  "search_results",
  "search_runs",
  "threads",
  "trace_runs",
  "trace_spans",
  "workspaces",
] as const;

async function initialize(name: string) {
  const stub = env.SYNC_ENGINE.getByName(name);
  const response = await stub.fetch("https://sync-engine.test/internal/snapshot");
  expect(response.status).toBe(200);
  return stub;
}

function tableNames(state: DurableObjectState): string[] {
  return state.storage.sql
    .exec<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .toArray()
    .map(({ name }) => name);
}

async function migrate(state: DurableObjectState, migrations = migrationManifest) {
  const database = new EffectDatabase(state.storage);
  await database.runPromise(migrateDatabase({ database, migrations }));
}

function replaceWithLegacySchema(state: DurableObjectState): void {
  for (const table of tableNames(state)) {
    state.storage.sql.exec(`DROP TABLE "${table}"`);
  }

  state.storage.sql.exec(`
    CREATE TABLE workspaces (
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
    )
  `);
  state.storage.sql.exec(`
    CREATE TABLE threads (
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
      optimistic INTEGER,
      op_id TEXT
    )
  `);
  state.storage.sql.exec(
    `INSERT INTO workspaces (
       id, name, slug, system_prompt, default_model_id, default_reasoning_level,
       default_search_mode, prefer_free_search, created_at, updated_at, sort_key
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "legacy-workspace",
    "Legacy",
    "legacy",
    "",
    "legacy-model",
    "off",
    0,
    0,
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
    0,
  );
  state.storage.sql.exec(
    `INSERT INTO threads (
       id, workspace_id, title, pinned, created_at, updated_at, last_message_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    "legacy-thread",
    "legacy-workspace",
    "Legacy thread",
    0,
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
  );
}

function insertInitializationProbe(state: DurableObjectState): void {
  state.storage.sql.exec(
    `INSERT INTO workspaces (
       id, name, slug, system_prompt, default_model_id, default_reasoning_level,
       default_search_mode, default_search_limit, prefer_free_search, created_at,
       updated_at, sort_key
     ) VALUES (
       'initialization-probe', 'Probe', 'probe', '', 'test-model', 'off',
       0, 3, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0
     )`,
  );
}

describe("SyncEngineDurableObject SQLite migrations", () => {
  it("constructs the Durable Object and applies the generated migration", async () => {
    const stub = await initialize("fresh-migration");

    await runInDurableObject(stub, (_instance, state) => {
      const migrations = state.storage.sql
        .exec<{ name: string }>("SELECT name FROM __drizzle_migrations ORDER BY created_at")
        .toArray();

      expect(tableNames(state)).toEqual(EXPECTED_TABLES);
      expect(migrations).toEqual([{ name: "20260616210015_powerful_hellion" }]);
    });
  });

  it("treats the current schema as a no-op", async () => {
    const stub = await initialize("current-schema");

    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO metadata (key, value) VALUES ('migration_noop_probe', 'preserved')",
      );

      await migrate(state);

      const migrationCount = state.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM __drizzle_migrations")
        .one().count;
      const probe = state.storage.sql
        .exec<{ value: string }>("SELECT value FROM metadata WHERE key = 'migration_noop_probe'")
        .one();
      expect(migrationCount).toBe(1);
      expect(probe.value).toBe("preserved");
    });
  });

  it("preserves current-protocol data when the Durable Object is reconstructed", async () => {
    const objectName = "current-protocol-reconstruction";
    const stub = await initialize(objectName);
    await runInDurableObject(stub, (_instance, state) => insertInitializationProbe(state));

    await abortAllDurableObjects();
    const reconstructedStub = env.SYNC_ENGINE.getByName(objectName);
    const response = await reconstructedStub.fetch("https://sync-engine.test/internal/snapshot");
    expect(response.status).toBe(200);

    await runInDurableObject(reconstructedStub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ count: number }>(
            "SELECT COUNT(*) AS count FROM workspaces WHERE id = 'initialization-probe'",
          )
          .one().count,
      ).toBe(1);
      expect(
        state.storage.sql
          .exec<{ count: number }>("SELECT COUNT(*) AS count FROM __drizzle_migrations")
          .one().count,
      ).toBe(1);
    });
  });

  it("resets sync state when the stored protocol version is stale", async () => {
    const objectName = "stale-protocol-reconstruction";
    const stub = await initialize(objectName);
    await runInDurableObject(stub, (_instance, state) => {
      insertInitializationProbe(state);
      state.storage.sql.exec(
        "UPDATE metadata SET value = 'legacy-protocol' WHERE key = 'sync_protocol_version'",
      );
    });

    await abortAllDurableObjects();
    const reconstructedStub = env.SYNC_ENGINE.getByName(objectName);
    const response = await reconstructedStub.fetch("https://sync-engine.test/internal/snapshot");
    expect(response.status).toBe(200);

    await runInDurableObject(reconstructedStub, (_instance, state) => {
      expect(
        state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM workspaces").one()
          .count,
      ).toBe(0);
      expect(
        state.storage.sql
          .exec<{ value: string }>("SELECT value FROM metadata WHERE key = 'sync_protocol_version'")
          .one().value,
      ).toBe(SYNC_PROTOCOL_VERSION);
    });
  });

  it("repairs a known pre-tracking legacy schema", async () => {
    const stub = await initialize("legacy-repair");

    await runInDurableObject(stub, async (_instance, state) => {
      replaceWithLegacySchema(state);

      await migrate(state);

      const workspaceColumns = new Set(
        state.storage.sql
          .exec<{ name: string }>("PRAGMA table_info(workspaces)")
          .toArray()
          .map(({ name }) => name),
      );
      const threadColumns = new Set(
        state.storage.sql
          .exec<{ name: string }>("PRAGMA table_info(threads)")
          .toArray()
          .map(({ name }) => name),
      );
      const legacyWorkspace = state.storage.sql
        .exec<{ default_search_limit: number }>(
          "SELECT default_search_limit FROM workspaces WHERE id = 'legacy-workspace'",
        )
        .one();
      const migrationCount = state.storage.sql
        .exec<{ count: number }>("SELECT COUNT(*) AS count FROM __drizzle_migrations")
        .one().count;

      expect(tableNames(state)).toEqual(EXPECTED_TABLES);
      expect(workspaceColumns).toContain("default_search_limit");
      for (const column of [
        "forked_from_thread_id",
        "forked_from_message_id",
        "search_enabled",
        "search_limit",
        "thread_type",
        "comparison_group_id",
      ]) {
        expect(threadColumns).toContain(column);
      }
      expect(legacyWorkspace.default_search_limit).toBe(3);
      expect(migrationCount).toBe(1);
    });
  });

  it("rolls back a failed migration and its tracking row", async () => {
    const stub = await initialize("migration-rollback");

    await runInDurableObject(stub, async (_instance, state) => {
      const database = new EffectDatabase(state.storage);
      const failingMigrations = {
        ...migrationManifest,
        "20260617210015_rollback_probe":
          "CREATE TABLE rollback_probe (id TEXT PRIMARY KEY);--> statement-breakpoint\nINSERT INTO missing_table (id) VALUES ('fail');",
      };

      await expect(
        database.runPromise(migrateDatabase({ database, migrations: failingMigrations })),
      ).rejects.toThrow();

      expect(tableNames(state)).not.toContain("rollback_probe");
      expect(
        state.storage.sql
          .exec<{ count: number }>("SELECT COUNT(*) AS count FROM __drizzle_migrations")
          .one().count,
      ).toBe(1);
    });
  });

  it("rolls back command events, projections, and ack when ack persistence fails", async () => {
    const stub = await initialize("command-rollback");

    await runInDurableObject(stub, async (instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO commands (op_id, type, status, response_json, created_at, acked_seq)
         VALUES (?, ?, ?, NULL, ?, NULL)`,
        "rollback-op",
        "bootstrap_session",
        "pending",
        "2026-01-01T00:00:00.000Z",
      );
      await expect(
        instance.fetch(
          new Request("https://sync-engine.test/internal/command", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              opId: "rollback-op",
              commandType: "bootstrap_session",
              payload: { defaultModelId: "test-model" },
            }),
          }),
        ),
      ).rejects.toThrow();

      const rowCounts = Object.fromEntries(
        ["events", "account_settings", "workspaces", "threads"].map((table) => [
          table,
          state.storage.sql.exec<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).one()
            .count,
        ]),
      );
      const command = state.storage.sql
        .exec<{ status: string; response_json: string | null; acked_seq: number | null }>(
          "SELECT status, response_json, acked_seq FROM commands WHERE op_id = 'rollback-op'",
        )
        .one();

      expect(rowCounts).toEqual({
        events: 0,
        account_settings: 0,
        workspaces: 0,
        threads: 0,
      });
      expect(command).toEqual({ status: "pending", response_json: null, acked_seq: null });
    });
  });
});
