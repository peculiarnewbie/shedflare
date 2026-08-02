import { SYNC_PROTOCOL_VERSION } from "#/domain";
import migrationManifest from "../../drizzle/migrations";
import type { EffectDatabase } from "./effect-database";
import { migrateDatabase } from "./migrator";
import { resetForProtocolVersion } from "./schema-helpers";
import { syncLog } from "./sync-utils";

const PROTOCOL_VERSION_KEY = "sync_protocol_version";

function readProtocolVersion(database: EffectDatabase): string | null {
  return (
    database.storage.sql
      .exec<{ value: string }>("SELECT value FROM metadata WHERE key = ?", PROTOCOL_VERSION_KEY)
      .toArray()[0]?.value ?? null
  );
}

function resetProtocolState(database: EffectDatabase): void {
  // Protocol reset is a lifecycle operation over the schema-derived table list.
  database.storage.transactionSync(() => {
    resetForProtocolVersion((query, ...params) => {
      database.storage.sql.exec(query, ...params);
    });
    database.storage.sql.exec(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)",
      PROTOCOL_VERSION_KEY,
      SYNC_PROTOCOL_VERSION,
    );
  });
}

/** Owns the complete SQLite initialization lifecycle for one Chat Durable Object. */
export async function initializeChatDatabase(database: EffectDatabase): Promise<void> {
  syncLog("migrate_start");
  await database.runPromise(migrateDatabase({ database, migrations: migrationManifest }));
  syncLog("migrate_done");

  const previousProtocolVersion = readProtocolVersion(database);
  if (previousProtocolVersion === SYNC_PROTOCOL_VERSION) return;

  syncLog("protocol_version_reset", {
    previous: previousProtocolVersion,
    current: SYNC_PROTOCOL_VERSION,
  });
  resetProtocolState(database);
}
